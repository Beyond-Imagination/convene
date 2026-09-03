import { MeetingReport } from '../meeting-report';
import { Page, ReportListCriteria } from '../value-objects/report-list-query';

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

/**
 * MeetingReport Aggregate의 영속/조회 경계.
 * 도메인 객체를 그대로 주고받으며, 직렬화/역직렬화는 구현체 책임이다.
 *
 * 조회 키:
 *   - `id`           회의록 도큐먼트 id (Application이 생성, MongoDB ObjectId 문자열 호환).
 *   - `meetingId`    원본 Meeting Aggregate id. 회의 1건당 회의록 1건 보장.
 *
 * 목록 조회:
 *   - `findPage`     정렬·페이지 조건은 `ReportListCriteria`가 통째로 나른다.
 */
export interface ReportRepository {
  save(report: MeetingReport): Promise<void>;

  findById(id: string): Promise<MeetingReport | null>;

  findByMeetingId(meetingId: string): Promise<MeetingReport | null>;

  findPage(criteria: ReportListCriteria): Promise<Page<MeetingReport>>;
}
