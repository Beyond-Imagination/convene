import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { Clock, LoggerPort } from '@/shared-kernel/domain/ports';

// DB id가 있을 때만 모듈에 등록된다.
@Injectable()
export class NotionPollingScheduler {
  private running = false;

  constructor(
    private readonly provisioning: NotionMeetingProvisioningService,
    private readonly clock: Clock,
    private readonly logger: LoggerPort,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.provisioning.pollPendingIssues(this.clock.now());
    } catch (error) {
      // 폴링 전체 실패(예: DB query 자체 실패)가 프로세스를 죽이지 않도록 삼킨다.
      this.logger.error({ err: error }, 'notion 폴링 실패');
    } finally {
      this.running = false;
    }
  }
}
