import { MeetingReport } from '../meeting-report';

/**
 * MeetingReport Aggregate 의 영속/조회 경계.
 *
 * 구현체는 infrastructure 의 스토리지(v1: MongoDB Atlas, 테스트: in-memory)를
 * 제공한다. 도메인 객체를 그대로 주고받으며, 직렬화/역직렬화는 구현체 책임이다.
 *
 * 조회 키:
 *   - `id`           회의록 도큐먼트 id (Application이 생성, MongoDB ObjectId 문자열 호환).
 *   - `meetingId`    원본 Meeting Aggregate id. 회의 1건당 회의록 1건 보장.
 *
 * 정렬:
 *   - `listRecent`   회의록 목록 페이지에서 최신순 노출. v1엔 단순 limit만.
 */
export interface ReportRepository {
  save(report: MeetingReport): Promise<void>;

  findById(id: string): Promise<MeetingReport | null>;

  findByMeetingId(meetingId: string): Promise<MeetingReport | null>;

  listRecent(limit: number): Promise<MeetingReport[]>;
}
