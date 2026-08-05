import { Inject, Injectable } from '@nestjs/common';

import { NOTION_REPORT, NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import {
  LOGGER,
  LoggerPort,
  REPORT_LOOKUP_PORT,
  ReportLookupPort,
} from '@/shared-kernel/domain/ports';

@Injectable()
export class NotionReportPushService {
  constructor(
    @Inject(REPORT_LOOKUP_PORT) private readonly reportLookup: ReportLookupPort,
    @Inject(NOTION_REPORT) private readonly notionReport: NotionReportPort,
    @Inject(LOGGER) private readonly logger: LoggerPort,
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
    } catch (error) {
      this.logger.error({ reportId, err: error }, '회의록 노션 삽입 실패');
    }
  }
}
