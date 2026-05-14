import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';

/**
 * MeetingRepository의 in-memory 구현체.
 *
 * e2e 테스트와 v1 마이그레이션 초기 부트스트랩용. Redis 구현체로 교체되기 전까지의
 * default provider이며, 동시성/영속성 보장은 없다.
 */
export class InMemoryMeetingRepository implements MeetingRepository {
  private readonly store = new Map<string, Meeting>();

  async findByCode(code: string): Promise<Meeting | null> {
    return this.store.get(code) ?? null;
  }

  async save(meeting: Meeting): Promise<void> {
    this.store.set(meeting.code.value, meeting);
  }
}
