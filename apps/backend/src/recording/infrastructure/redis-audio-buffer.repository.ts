import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AudioBufferRepository } from '@/recording/domain/ports';

const PARTICIPANT_KEY_PREFIX = 'audio-buffer:';
const MEETING_INDEX_KEY_PREFIX = 'audio-buffer:meeting:';
const STARTED_AT_KEY_PREFIX = 'audio-buffer:startedAt:';

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
 * 비운다 — 반환과 동시에 폐기(PLAN.md §3).
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

  async consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<{ participantId: string; audio: Buffer; startedAtMs?: number }>> {
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
    }
    pipeline.del(indexKey);
    const results = await pipeline.exec();
    if (!results) return [];

    const out: { participantId: string; audio: Buffer; startedAtMs?: number }[] = [];
    // pid 당 4명령(lrangeBuffer, del, get, del) 이 순서대로 push 됐다. 마지막
    // del(indexKey) 은 results 의 가장 끝에 있어 무시한다.
    const COMMANDS_PER_PID = 4;
    for (let i = 0; i < pids.length; i++) {
      const lrangeRes = results[i * COMMANDS_PER_PID];
      const startedAtRes = results[i * COMMANDS_PER_PID + 2];
      if (!lrangeRes) continue;
      const [err, chunks] = lrangeRes as [Error | null, Buffer[]];
      if (err) throw err;
      if (!chunks || chunks.length === 0) continue;
      const startedAtRaw = startedAtRes
        ? (startedAtRes as [Error | null, string | null])[1]
        : null;
      const startedAtMs =
        startedAtRaw !== null && startedAtRaw !== undefined
          ? Number(startedAtRaw)
          : undefined;
      out.push({
        participantId: pids[i],
        audio: Buffer.concat(chunks),
        startedAtMs,
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
}
