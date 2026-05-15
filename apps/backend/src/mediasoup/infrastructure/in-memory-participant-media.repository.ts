import { Injectable } from '@nestjs/common';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import { ParticipantMediaRepository } from '@/mediasoup/domain/ports';

/**
 * ParticipantMediaRepository 의 in-memory 구현체. v1 부트스트랩용.
 *
 * participantId 기반 단순 Map. 같은 회의 그룹 조회는 meetingCode 로 filter.
 */
@Injectable()
export class InMemoryParticipantMediaRepository implements ParticipantMediaRepository {
  private readonly store = new Map<string, ParticipantMedia>();

  async save(media: ParticipantMedia): Promise<void> {
    this.store.set(media.participantId, media);
  }

  async findByParticipantId(participantId: string): Promise<ParticipantMedia | null> {
    return this.store.get(participantId) ?? null;
  }

  async findByMeetingCode(meetingCode: string): Promise<ParticipantMedia[]> {
    return Array.from(this.store.values()).filter((m) => m.meetingCode === meetingCode);
  }

  async removeByParticipantId(participantId: string): Promise<void> {
    this.store.delete(participantId);
  }

  async removeAllByMeetingCode(meetingCode: string): Promise<void> {
    for (const [pid, media] of this.store) {
      if (media.meetingCode === meetingCode) this.store.delete(pid);
    }
  }
}
