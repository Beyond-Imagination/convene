import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AudioBufferRepository } from '@/recording/domain/ports';

const PARTICIPANT_KEY_PREFIX = 'audio-buffer:';
const MEETING_INDEX_KEY_PREFIX = 'audio-buffer:meeting:';

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

  async consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<{ participantId: string; audio: Buffer }>> {
    const indexKey = this.meetingIndexKey(meetingCode);
    const pids = await this.redis.smembers(indexKey);
    if (pids.length === 0) {
      await this.redis.del(indexKey);
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const pid of pids) {
      const key = this.participantKey(meetingCode, pid);
      pipeline.lrangeBuffer(key, 0, -1);
      pipeline.del(key);
    }
    pipeline.del(indexKey);
    const results = await pipeline.exec();
    if (!results) return [];

    const out: { participantId: string; audio: Buffer }[] = [];
    // 각 pid 당 두 명령(lrangeBuffer, del) 이 순서대로 push 됐다. 마지막 del(indexKey)
    // 은 results 의 가장 끝에 있어 무시한다.
    for (let i = 0; i < pids.length; i++) {
      const lrangeRes = results[i * 2];
      if (!lrangeRes) continue;
      const [err, chunks] = lrangeRes as [Error | null, Buffer[]];
      if (err) throw err;
      if (!chunks || chunks.length === 0) continue;
      out.push({ participantId: pids[i], audio: Buffer.concat(chunks) });
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
