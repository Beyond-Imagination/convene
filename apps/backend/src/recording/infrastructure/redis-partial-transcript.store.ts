import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AbsoluteTranscriptSegment, PartialTranscriptStore } from '@/recording/domain/ports/partial-transcript.store';

const PARTIAL_TRANSCRIPT_KEY_PREFIX = 'transcript-partial:';

/**
 * `transcript-partial:{meetingCode}` LIST에 각 segment를 JSON 직렬화해 RPUSH.
 * append가 여러 번 호출돼도 회의 단위로 순서대로 누적된다.
 * consume은 LRANGE + DEL로 atomic 하게 모두 가져오고 키를 비운다.
 */
@Injectable()
export class RedisPartialTranscriptStore implements PartialTranscriptStore {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async append(
    meetingCode: string,
    segments: ReadonlyArray<AbsoluteTranscriptSegment>,
  ): Promise<void> {
    if (segments.length === 0) return;
    const payload = segments.map((s) => JSON.stringify(s));
    await this.redis.rpush(this.key(meetingCode), ...payload);
  }

  async consume(meetingCode: string): Promise<ReadonlyArray<AbsoluteTranscriptSegment>> {
    const key = this.key(meetingCode);
    const result = await this.redis.multi().lrange(key, 0, -1).del(key).exec();
    if (!result) return [];
    const [, raw] = result[0] as [Error | null, string[] | null];
    if (!raw || raw.length === 0) return [];
    return raw.map((s) => JSON.parse(s) as AbsoluteTranscriptSegment);
  }

  private key(meetingCode: string): string {
    return `${PARTIAL_TRANSCRIPT_KEY_PREFIX}${meetingCode}`;
  }
}
