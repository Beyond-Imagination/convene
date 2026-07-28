import { NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { LoggerPort, ReportLookupPort } from '@/shared-kernel/domain/ports';

interface NotionReportPushDeps {
  reportLookup: ReportLookupPort;
  notionReport: NotionReportPort;
  logger: LoggerPort;
}

export class NotionReportPushService {
  constructor(private readonly deps: NotionReportPushDeps) {}

  /**
   * 확정된 회의록을 그 회의를 만들어낸 노션 이슈에 옮긴다.
   * 회의록은 이미 확정된 뒤이므로 실패해도 되돌리지 않고 로그만 남긴다(best-effort).
   */
  async pushFinalizedReport(reportId: string): Promise<void> {
    try {
      const report = await this.deps.reportLookup.findFinalizedReport(reportId);
      if (report === null || report.issueId === null) return;

      await this.deps.notionReport.pushReport(report.issueId, report);
      this.deps.logger.info({ reportId, issueId: report.issueId }, '회의록 노션 삽입 완료');
    } catch (error) {
      this.deps.logger.error({ reportId, err: error }, '회의록 노션 삽입 실패');
    }
  }
}
