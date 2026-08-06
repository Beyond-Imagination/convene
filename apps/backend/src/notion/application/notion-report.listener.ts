import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ReportFinalizedPayload } from '@/shared-kernel/domain/domain-event.payloads';

import { NotionReportPushService } from './notion-report-push.service';

// 노션 토큰이 있을 때만 모듈에 등록된다.
@Injectable()
export class NotionReportListener {
  constructor(private readonly service: NotionReportPushService) {}

  @OnEvent(REPORT_EVENTS.FINALIZED)
  async onReportFinalized(payload: ReportFinalizedPayload): Promise<void> {
    await this.service.pushFinalizedReport(payload.reportId);
  }
}
