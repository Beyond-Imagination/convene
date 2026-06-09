import { Injectable } from '@nestjs/common';

import { MeetingReportSnapshot } from '@/reports/domain/meeting-report';
import { NotionPort } from '@/reports/domain/ports';

/**
 * NotionPort의 v1 placeholder 구현체.
 *
 * v1은 노션 연동을 수행하지 않으므로 항상 `null`을 돌려주어 Aggregate의 `attachNotionPushResult`가 호출되지 않게 한다.
 * v2에서 실제 Notion API 어댑터로 교체한다.
 */
@Injectable()
export class NoopNotion implements NotionPort {
  async push(_report: MeetingReportSnapshot): Promise<null> {
    return null;
  }
}
