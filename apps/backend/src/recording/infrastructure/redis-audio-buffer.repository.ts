import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AudioBufferRepository, AudioRun } from '@/recording/domain/ports/audio-buffer.repository';

import { PCM_BYTES_PER_SECOND } from './audio-chunker';

const PARTICIPANT_KEY_PREFIX = 'audio-buffer:';
const MEETING_INDEX_KEY_PREFIX = 'audio-buffer:meeting:';

/** LIST 원소 = 시각 헤더(epoch ms, BE) + PCM 본문. */
const STAMP_BYTES = 8;

/** 같은 run 으로 볼 시간 오차 한계(ms). 도착 시각 기반이라 스케줄링 지터가 조금 낀다. */
const RUN_TOLERANCE_MS = 120;

const bytesToMs = (bytes: number): number => Math.floor((bytes / PCM_BYTES_PER_SECOND) * 1000);

const encodeChunk = (pcm: Buffer, startedAtMs: number): Buffer => {
  const stamped = Buffer.allocUnsafe(STAMP_BYTES + pcm.length);
  stamped.writeBigUInt64BE(BigInt(startedAtMs), 0);
  pcm.copy(stamped, STAMP_BYTES);
  return stamped;
};

const decodeChunk = (stamped: Buffer): AudioRun => ({
  startedAtMs: Number(stamped.readBigUInt64BE(0)),
  pcm: stamped.subarray(STAMP_BYTES),
});

function groupIntoRuns(stamped: ReadonlyArray<Buffer>): AudioRun[] {
  const runs: AudioRun[] = [];
  let parts: Buffer[] = [];
  let runStartMs = 0;
  let expectedNextMs = 0;

  for (const raw of stamped) {
    const chunk = decodeChunk(raw);
    const continues =
      parts.length > 0 && Math.abs(chunk.startedAtMs - expectedNextMs) <= RUN_TOLERANCE_MS;
    if (!continues && parts.length > 0) {
      runs.push({ pcm: Buffer.concat(parts), startedAtMs: runStartMs });
      parts = [];
    }
    if (parts.length === 0) runStartMs = chunk.startedAtMs;
    parts.push(chunk.pcm);
    expectedNextMs = chunk.startedAtMs + bytesToMs(chunk.pcm.length);
  }
  if (parts.length > 0) runs.push({ pcm: Buffer.concat(parts), startedAtMs: runStartMs });
  return runs;
}

/**
 * 키 구조:
 *   - `audio-buffer:{meetingCode}:{participantId}` (LIST, binary) — `시각(8B) + PCM` 원소
 *   - `audio-buffer:meeting:{meetingCode}` (SET) — 회의 안 participantId 색인
 */
@Injectable()
export class RedisAudioBufferRepository implements AudioBufferRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async append(
    meetingCode: string,
    participantId: string,
    chunk: Buffer,
    startedAtMs: number,
  ): Promise<void> {
    await this.redis
      .pipeline()
      .rpush(this.participantKey(meetingCode, participantId), encodeChunk(chunk, startedAtMs))
      .sadd(this.meetingIndexKey(meetingCode), participantId)
      .exec();
  }

  async listActiveMeetings(): Promise<string[]> {
    const keyPrefix = this.redis.options.keyPrefix ?? '';
    const indexPrefix = `${keyPrefix}${MEETING_INDEX_KEY_PREFIX}`;
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${indexPrefix}*`, 'COUNT', 100);
      cursor = next;
      for (const k of keys) {
        out.push(k.substring(indexPrefix.length));
      }
    } while (cursor !== '0');
    return out;
  }

  async listActiveParticipants(meetingCode: string): Promise<string[]> {
    return this.redis.smembers(this.meetingIndexKey(meetingCode));
  }

  async drainAvailable(
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<ReadonlyArray<AudioRun>> {
    const participantKey = this.participantKey(meetingCode, participantId);

    const fetched = await this.redis
      .multi()
      .lrangeBuffer(participantKey, 0, -1)
      .del(participantKey)
      .exec();
    if (!fetched) return [];
    const [, stamped] = fetched[0] as [Error | null, Buffer[] | null];
    if (!stamped || stamped.length === 0) return [];

    const runs = groupIntoRuns(stamped);
    const last = runs[runs.length - 1];

    // 마지막 run 의 꼬리만 남긴다 — 앞선 run 들은 뒤와 이어지지 않는다.
    const keep = Math.min(keepLastBytes, last.pcm.length);
    const drained = runs.slice(0, -1);
    const lastDrainLen = last.pcm.length - keep;
    if (lastDrainLen > 0) {
      drained.push({ pcm: last.pcm.subarray(0, lastDrainLen), startedAtMs: last.startedAtMs });
    }

    if (keep > 0) {
      // LPUSH 라 그 사이 들어온 새 append(RPUSH)보다 앞에 놓인다.
      const remainder = last.pcm.subarray(lastDrainLen);
      await this.redis.lpush(
        participantKey,
        encodeChunk(Buffer.from(remainder), last.startedAtMs + bytesToMs(lastDrainLen)),
      );
    }
    return drained.map((run) => ({ pcm: Buffer.from(run.pcm), startedAtMs: run.startedAtMs }));
  }

  async consume(meetingCode: string): Promise<
    ReadonlyArray<{
      participantId: string;
      runs: ReadonlyArray<AudioRun>;
    }>
  > {
    const indexKey = this.meetingIndexKey(meetingCode);
    const pids = await this.redis.smembers(indexKey);
    if (pids.length === 0) {
      await this.redis.del(indexKey);
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const pid of pids) {
      pipeline.lrangeBuffer(this.participantKey(meetingCode, pid), 0, -1);
      pipeline.del(this.participantKey(meetingCode, pid));
    }
    pipeline.del(indexKey);
    const results = await pipeline.exec();
    if (!results) return [];

    const out: { participantId: string; runs: ReadonlyArray<AudioRun> }[] = [];
    const COMMANDS_PER_PID = 2;
    for (let i = 0; i < pids.length; i++) {
      const lrangeRes = results[i * COMMANDS_PER_PID];
      if (!lrangeRes) continue;
      const [err, stamped] = lrangeRes as [Error | null, Buffer[]];
      if (err) throw err;
      if (!stamped || stamped.length === 0) continue;
      const runs = groupIntoRuns(stamped).map((run) => ({
        pcm: Buffer.from(run.pcm),
        startedAtMs: run.startedAtMs,
      }));
      out.push({ participantId: pids[i], runs });
    }
    return out;
  }

  private participantKey(meetingCode: string, participantId: string): string {
    return `${PARTICIPANT_KEY_PREFIX}${meetingCode}:${participantId}`;
  }

  private meetingIndexKey(meetingCode: string): string {
    return `${MEETING_INDEX_KEY_PREFIX}${meetingCode}`;
  }
}
