import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AudioBufferRepository } from '@/recording/domain/ports';

const KEY_PREFIX = 'audio-buffer:';

/**
 * AudioBufferRepository 의 redis(ioredis) 구현체.
 *
 * - `audio-buffer:{meetingCode}` LIST 에 binary chunk 를 RPUSH 로 누적한다.
 *   ioredis 는 Buffer 인자를 그대로 binary 로 저장하며, `lrangeBuffer` 가
 *   같은 LIST 를 Buffer[] 로 돌려준다(문자열 코덱 변환 없음).
 * - `consume` 은 LRANGE + DEL 을 pipeline 으로 묶어 **반환과 동시에 삭제**한다
 *   (PLAN.md §3 — 오디오 STT 후 즉시 폐기, 장기 보존 X).
 * - 누적된 chunk 가 없을 때(=한 번도 append 되지 않은 경우) `consume` 은 null.
 */
@Injectable()
export class RedisAudioBufferRepository implements AudioBufferRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async append(meetingCode: string, chunk: Buffer): Promise<void> {
    await this.redis.rpush(this.key(meetingCode), chunk);
  }

  async consume(meetingCode: string): Promise<Buffer | null> {
    const key = this.key(meetingCode);
    const [chunksResult, _delResult] = (await this.redis
      .pipeline()
      .lrangeBuffer(key, 0, -1)
      .del(key)
      .exec()) ?? [];

    if (!chunksResult) return null;
    const [err, chunks] = chunksResult as [Error | null, Buffer[]];
    if (err) throw err;
    if (!chunks || chunks.length === 0) return null;
    return Buffer.concat(chunks);
  }

  private key(meetingCode: string): string {
    return `${KEY_PREFIX}${meetingCode}`;
  }
}
