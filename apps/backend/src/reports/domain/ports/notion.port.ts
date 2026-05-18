import { MeetingReportSnapshot } from '../meeting-report';
import { NotionPushResult } from '../value-objects';

/**
 * 회의록을 노션 페이지로 push하는 어댑터의 도메인 포트.
 *
 * v1.0.0에서는 `NoopNotionAdapter`가 호출되어 항상 `null`(혹은 skip 표시)을
 * 돌려주고, v2.0.0에서 노션 API 실구현이 주입된다(PLAN.md §8 / ARCHITECTURE.md §7).
 *
 * 반환이 `null`인 경우 Application Service는 Aggregate의
 * `attachNotionPushResult`를 호출하지 않는다 — 단순 skip이다.
 */
export interface NotionPort {
  push(report: MeetingReportSnapshot): Promise<NotionPushResult | null>;
}
