import { BugReportRequest } from '@convene/shared-interfaces';

import { BugReportImage, NotionBugReportPort } from '@/notion/domain/ports/notion-bug-report.port';
import { BugReportRateLimiter } from '@/notion/infrastructure/bug-report-rate-limiter';

export class NotionBugReportService {
  constructor(
    private readonly port: NotionBugReportPort,
    private readonly limiter: BugReportRateLimiter,
    private readonly clock: { now(): Date },
  ) {}

  async submit(_request: BugReportRequest): Promise<void> {
    throw new Error('not implemented');
  }

  async uploadImage(_image: BugReportImage): Promise<string> {
    throw new Error('not implemented');
  }
}
