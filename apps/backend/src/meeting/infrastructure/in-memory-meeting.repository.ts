import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';

/**
 * MeetingRepository의 in-memory 구현체 (stub).
 *
 * 실제 구현은 InMemoryMeetingRepository spec green 사이클에서 채운다.
 */
export class InMemoryMeetingRepository implements MeetingRepository {
  async findByCode(_code: string): Promise<Meeting | null> {
    throw new Error('not implemented');
  }

  async save(_meeting: Meeting): Promise<void> {
    throw new Error('not implemented');
  }
}
