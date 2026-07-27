import { NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { FinalizedReport } from '@/shared-kernel/domain/ports';

export class NotionReportAdapter implements NotionReportPort {
  constructor(private readonly client: NotionHttpClient) {}

  async pushReport(_issueId: string, _report: FinalizedReport): Promise<void> {
    throw new Error('not implemented');
  }
}
