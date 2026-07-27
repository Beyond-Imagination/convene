import { Meeting } from '@/meeting/domain/meeting';

/**
 * Meeting Aggregate의 영속 경계.
 * `code` 유일성 보장은 본 Repository의 책임
 */
export interface MeetingRepository {
  /** code로 회의를 찾는다. 없으면 null. */
  findByCode(code: string): Promise<Meeting | null>;

  /** 회의를 저장한다(생성·갱신 공용). 동시성 처리는 구현체 책임. */
  save(meeting: Meeting): Promise<void>;

  /** 아직 종료되지 않은 회의의 code 목록. idle 스케줄러가 순회 대상으로 쓴다. */
  listOpenCodes(): Promise<string[]>;
}
