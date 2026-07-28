import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { resolveNotionPollCron } from '@/config/notion.config';
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

  @Cron(resolveNotionPollCron())
  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { found, provisioned } = await this.provisioning.pollPendingIssues(this.clock.now());
      // 대상이 없는 주기는 debug로 흘려 로그를 채우지 않는다.
      if (found === 0) {
        this.logger.debug({ found, provisioned }, 'notion 폴링 완료');
      } else {
        this.logger.info({ found, provisioned }, 'notion 폴링 완료');
      }
    } catch (error) {
      // 폴링 전체 실패(예: DB query 자체 실패)가 프로세스를 죽이지 않도록 삼킨다.
      this.logger.error({ err: error }, 'notion 폴링 실패');
    } finally {
      this.running = false;
    }
  }
}
