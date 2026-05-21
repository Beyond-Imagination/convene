import { Injectable } from '@nestjs/common';

import { AudioBufferRepository } from '@/recording/domain/ports';

/**
 * AudioBufferRepository 의 in-memory 구현체.
 *
 * v1 부트스트랩 / 테스트용. 회의 1건 규모의 작은 버퍼만 다룬다는 가정으로
 * 모든 chunk 를 메모리에 누적하고, `consume` 시점에 한 번에 `Buffer.concat` 으로
 * 합쳐 돌려준 뒤 즉시 삭제한다(PLAN.md §3 — STT 후 즉시 폐기).
 */
@Injectable()
export class InMemoryAudioBufferRepository implements AudioBufferRepository {
  // meetingCode → (participantId → chunk list)
  private readonly store = new Map<string, Map<string, Buffer[]>>();

  async append(meetingCode: string, participantId: string, chunk: Buffer): Promise<void> {
    let perMeeting = this.store.get(meetingCode);
    if (!perMeeting) {
      perMeeting = new Map();
      this.store.set(meetingCode, perMeeting);
    }
    const existing = perMeeting.get(participantId);
    if (existing) {
      existing.push(chunk);
    } else {
      perMeeting.set(participantId, [chunk]);
    }
  }

  async consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<{ participantId: string; audio: Buffer }>> {
    const perMeeting = this.store.get(meetingCode);
    if (!perMeeting || perMeeting.size === 0) {
      this.store.delete(meetingCode);
      return [];
    }
    const result: { participantId: string; audio: Buffer }[] = [];
    for (const [participantId, chunks] of perMeeting) {
      if (chunks.length === 0) continue;
      result.push({ participantId, audio: Buffer.concat(chunks) });
    }
    this.store.delete(meetingCode);
    return result;
  }
}
