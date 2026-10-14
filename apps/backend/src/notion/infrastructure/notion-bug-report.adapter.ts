import {
  BugReport,
  BugReportImage,
  NotionBugReportPort,
} from '@/notion/domain/ports/notion-bug-report.port';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';

export class NotionBugReportAdapter implements NotionBugReportPort {
  constructor(
    private readonly client: NotionHttpClient,
    private readonly databaseId: string,
  ) {}

  async createIssue(_report: BugReport): Promise<void> {
    throw new Error('not implemented');
  }

  async uploadImage(_image: BugReportImage): Promise<string> {
    throw new Error('not implemented');
  }
}
