import { Injectable } from '@nestjs/common';

import {
  AbsoluteTranscriptSegment,
  PartialTranscriptStore,
} from '@/recording/domain/ports';

/**
 * 부트스트랩 / 테스트용 in-memory 구현. 회의 1건 규모의 누적 segments
 * 만 메모리에 유지한다.
 */
@Injectable()
export class InMemoryPartialTranscriptStore implements PartialTranscriptStore {
  private readonly store = new Map<string, AbsoluteTranscriptSegment[]>();

  async append(
    meetingCode: string,
    segments: ReadonlyArray<AbsoluteTranscriptSegment>,
  ): Promise<void> {
    if (segments.length === 0) return;
    const existing = this.store.get(meetingCode);
    if (existing) existing.push(...segments);
    else this.store.set(meetingCode, [...segments]);
  }

  async consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<AbsoluteTranscriptSegment>> {
    const out = this.store.get(meetingCode) ?? [];
    this.store.delete(meetingCode);
    return out;
  }
}
