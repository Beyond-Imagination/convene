import { NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { LoggerPort, ReportLookupPort } from '@/shared-kernel/domain/ports';

interface NotionReportPushDeps {
  reportLookup: ReportLookupPort;
  notionReport: NotionReportPort;
  logger: LoggerPort;
}

export class NotionReportPushService {
  constructor(private readonly deps: NotionReportPushDeps) {}

  async pushFinalizedReport(_reportId: string): Promise<void> {
    throw new Error('not implemented');
  }
}
