import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AudioBufferRepository } from '@/recording/domain/ports';

import { PCM_BYTES_PER_SECOND } from './audio-chunker';

const bytesToMs = (bytes: number): number =>
  Math.floor((bytes / PCM_BYTES_PER_SECOND) * 1000);

const PARTICIPANT_KEY_PREFIX = 'audio-buffer:';
const MEETING_INDEX_KEY_PREFIX = 'audio-buffer:meeting:';
const STARTED_AT_KEY_PREFIX = 'audio-buffer:startedAt:';
const CURSOR_KEY_PREFIX = 'audio-buffer:cursor:';

/**
 * AudioBufferRepository 의 redis(ioredis) 구현체.
 *
 * 키 구조:
 *   - `audio-buffer:{meetingCode}:{participantId}` (LIST, binary) — chunk 누적
 *   - `audio-buffer:meeting:{meetingCode}` (SET) — 회의 안 participantId 색인
 *
 * binary chunk 는 `rpush(key, buffer)` 로 그대로 누적되고 `lrangeBuffer` 로 다시
 * `Buffer[]` 로 읽힌다(문자열 코덱 변환 없음). `consume` 은 회의 색인 SET 으로
 * 참가자 목록을 얻은 뒤 각 LIST 를 LRANGE + DEL pipeline 으로 묶어 한 번에
 * 비운다 — 반환과 동시에 폐기한다.
 *
 * 누적 적이 없는 회의(audio capture 미트리거 또는 모두 leave)는 빈 배열 반환.
 */
@Injectable()
export class RedisAudioBufferRepository implements AudioBufferRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async append(meetingCode: string, participantId: string, chunk: Buffer): Promise<void> {
    await this.redis
      .pipeline()
      .rpush(this.participantKey(meetingCode, participantId), chunk)
      .sadd(this.meetingIndexKey(meetingCode), participantId)
      .exec();
  }

  async listActiveMeetings(): Promise<string[]> {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${MEETING_INDEX_KEY_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = next;
      for (const k of keys) {
        out.push(k.substring(MEETING_INDEX_KEY_PREFIX.length));
      }
    } while (cursor !== '0');
    return out;
  }

  async listActiveParticipants(meetingCode: string): Promise<string[]> {
    return this.redis.smembers(this.meetingIndexKey(meetingCode));
  }

  async markStarted(
    meetingCode: string,
    participantId: string,
    startedAtMs: number,
  ): Promise<void> {
    // SET ... NX 로 첫 호출만 기록한다 — 같은 (code, pid) 두 번째 호출은 무시.
    await this.redis.set(
      this.startedAtKey(meetingCode, participantId),
      startedAtMs.toString(),
      'NX',
    );
  }

  async drainAvailable(
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }> {
    const participantKey = this.participantKey(meetingCode, participantId);
    const cursorKey = this.cursorKey(meetingCode, participantId);
    const startedAtKey = this.startedAtKey(meetingCode, participantId);

    // 누적 chunks + 메타데이터를 atomic 으로 가져오고 LIST 는 비운다.
    const fetched = await this.redis
      .multi()
      .lrangeBuffer(participantKey, 0, -1)
      .del(participantKey)
      .get(cursorKey)
      .get(startedAtKey)
      .exec();
    if (!fetched) {
      return { pcm: Buffer.alloc(0), startMs: 0 };
    }
    const [, chunks] = fetched[0] as [Error | null, Buffer[] | null];
    const [, cursorStr] = fetched[2] as [Error | null, string | null];
    const [, startedAtStr] = fetched[3] as [Error | null, string | null];
    const cursorBefore = cursorStr !== null ? Number(cursorStr) : 0;
    const startedAtMs = startedAtStr !== null ? Number(startedAtStr) : undefined;
    const total = chunks && chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);

    if (total.length <= keepLastBytes) {
      // drain 할 게 없으면 들고 있던 데이터를 다시 채워둔다. LPUSH 라 그 사이 들어온
      // 새 append(RPUSH) 보다 앞에 놓여 시간 순서가 유지된다.
      if (total.length > 0) await this.redis.lpush(participantKey, total);
      return { pcm: Buffer.alloc(0), startMs: bytesToMs(cursorBefore), startedAtMs };
    }

    const drainLen = total.length - keepLastBytes;
    const drainedPcm = total.subarray(0, drainLen);
    const remaining = total.subarray(drainLen);

    // remaining 을 LPUSH(앞에 push) 로 다시 채우고 cursor 를 갱신한다. LRANGE+DEL
    // 이후 새 append 가 들어왔다면 LIST 는 [new...] 상태이고, LPUSH remaining 으로
    // [remaining, new...] 가 된다 — 시간 순서 보존.
    await this.redis
      .multi()
      .lpush(participantKey, Buffer.from(remaining))
      .set(cursorKey, String(cursorBefore + drainLen))
      .exec();

    return {
      pcm: Buffer.from(drainedPcm),
      startMs: bytesToMs(cursorBefore),
      startedAtMs,
    };
  }

  async consume(
    meetingCode: string,
  ): Promise<
    ReadonlyArray<{
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
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
      pipeline.get(this.startedAtKey(meetingCode, pid));
      pipeline.del(this.startedAtKey(meetingCode, pid));
      pipeline.get(this.cursorKey(meetingCode, pid));
      pipeline.del(this.cursorKey(meetingCode, pid));
    }
    pipeline.del(indexKey);
    const results = await pipeline.exec();
    if (!results) return [];

    const out: {
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
    }[] = [];
    // pid 당 6명령(lrangeBuffer, del, get(startedAt), del, get(cursor), del).
    // 마지막 del(indexKey) 은 results 끝.
    const COMMANDS_PER_PID = 6;
    for (let i = 0; i < pids.length; i++) {
      const lrangeRes = results[i * COMMANDS_PER_PID];
      const startedAtRes = results[i * COMMANDS_PER_PID + 2];
      const cursorRes = results[i * COMMANDS_PER_PID + 4];
      if (!lrangeRes) continue;
      const [err, chunks] = lrangeRes as [Error | null, Buffer[]];
      if (err) throw err;
      if (!chunks || chunks.length === 0) continue;
      const startedAtRaw = startedAtRes
        ? (startedAtRes as [Error | null, string | null])[1]
        : null;
      const cursorRaw = cursorRes
        ? (cursorRes as [Error | null, string | null])[1]
        : null;
      const startedAtMs =
        startedAtRaw !== null && startedAtRaw !== undefined
          ? Number(startedAtRaw)
          : undefined;
      const startMs =
        cursorRaw !== null && cursorRaw !== undefined ? bytesToMs(Number(cursorRaw)) : undefined;
      out.push({
        participantId: pids[i],
        audio: Buffer.concat(chunks),
        startedAtMs,
        startMs,
      });
    }
    return out;
  }

  private participantKey(meetingCode: string, participantId: string): string {
    return `${PARTICIPANT_KEY_PREFIX}${meetingCode}:${participantId}`;
  }

  private meetingIndexKey(meetingCode: string): string {
    return `${MEETING_INDEX_KEY_PREFIX}${meetingCode}`;
  }

  private startedAtKey(meetingCode: string, participantId: string): string {
    return `${STARTED_AT_KEY_PREFIX}${meetingCode}:${participantId}`;
  }

  private cursorKey(meetingCode: string, participantId: string): string {
    return `${CURSOR_KEY_PREFIX}${meetingCode}:${participantId}`;
  }
}
