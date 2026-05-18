import { Injectable } from '@nestjs/common';

import { NotionPort } from '@/reports/domain/ports';
import { MeetingReportSnapshot } from '@/reports/domain/meeting-report';

/**
 * NotionPort 의 v1 placeholder 구현체.
 *
 * v1 은 노션 연동을 수행하지 않으므로 항상 `null` 을 돌려주어 Aggregate 의
 * `attachNotionPushResult` 가 호출되지 않게 한다. v2 에서 실제 Notion API
 * 어댑터로 교체한다(PLAN.md §8 / ARCHITECTURE.md §7).
 */
@Injectable()
export class NoopNotion implements NotionPort {
  async push(_report: MeetingReportSnapshot): Promise<null> {
    return null;
  }
}
