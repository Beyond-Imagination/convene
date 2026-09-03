import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Inject, Injectable } from '@nestjs/common';

import { NOTION_REPORT, NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { ReportLookupService } from '@/reports/application/report-lookup.service';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

@Injectable()
export class NotionReportPushService {
  constructor(
    private readonly reportLookup: ReportLookupService,
    @Inject(NOTION_REPORT) private readonly notionReport: NotionReportPort,
    private readonly clock: SystemClock,
    private readonly eventPublisher: NestEventBusDomainEventPublisher,
    private readonly logger: PinoLoggerAdapter,
  ) {}

  /**
   * 확정된 회의록을 그 회의를 만들어낸 노션 이슈에 옮긴다.
   * 회의록은 이미 확정된 뒤이므로 실패해도 되돌리지 않고 로그만 남긴다(best-effort).
   */
  async pushFinalizedReport(reportId: string): Promise<void> {
    try {
      const report = await this.reportLookup.findFinalizedReport(reportId);
      if (report === null || report.issueId === null) return;

      await this.notionReport.pushReport(report.issueId, report);
      this.logger.info({ reportId, issueId: report.issueId }, '회의록 노션 삽입 완료');
      await this.eventPublisher.publish(REPORT_EVENTS.NOTION_PUSHED, {
        reportId,
        pageId: report.issueId,
        at: this.clock.now(),
      });
    } catch (error) {
      this.logger.error({ reportId, err: error }, '회의록 노션 삽입 실패');
    }
  }
}
