import { BugReportRequest } from '@convene/shared-interfaces';
import { Inject, Injectable } from '@nestjs/common';

import {
  BugReportImage,
  NOTION_BUG_REPORT,
  NotionBugReportPort,
} from '@/notion/domain/ports/notion-bug-report.port';
import { BugReportRateLimiter } from '@/notion/infrastructure/bug-report-rate-limiter';
import { TooManyRequestsError } from '@/shared-kernel/domain/errors';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

const RATE_LIMITED_MESSAGE = '버그 리포트가 잠시 많이 몰렸습니다. 잠시 뒤 다시 보내 주세요.';

/** Convene 화면에서 받은 버그 리포트를 노션 이슈로 접수한다. */
@Injectable()
export class NotionBugReportService {
  constructor(
    @Inject(NOTION_BUG_REPORT) private readonly port: NotionBugReportPort,
    private readonly limiter: BugReportRateLimiter,
    private readonly clock: SystemClock,
  ) {}

  async submit(request: BugReportRequest): Promise<void> {
    if (!(await this.limiter.tryAcquire('report'))) {
      throw new TooManyRequestsError(RATE_LIMITED_MESSAGE);
    }
    await this.port.createIssue({ ...request, reportedAt: this.clock.now() });
  }

  async uploadImage(image: BugReportImage): Promise<string> {
    if (!(await this.limiter.tryAcquire('image'))) {
      throw new TooManyRequestsError(RATE_LIMITED_MESSAGE);
    }
    return this.port.uploadImage(image);
  }
}
