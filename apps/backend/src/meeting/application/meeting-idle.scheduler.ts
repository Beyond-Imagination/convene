import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { MeetingService } from '@/meeting/application/meeting.service';
import { LoggerPort } from '@/shared-kernel/domain/ports';

// idle 임계(1분)보다 촘촘히 돌아 종료 지연이 주기 이상 벌어지지 않게 한다.
export const IDLE_SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class MeetingIdleScheduler {
  private running = false;

  constructor(
    private readonly service: MeetingService,
    private readonly logger: LoggerPort,
  ) {}

  @Interval(IDLE_SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { scanned, closed } = await this.service.sweepIdleMeetings();
      if (closed > 0) {
        this.logger.info({ scanned, closed }, 'idle 회의 종료');
      }
    } catch (error) {
      // sweep 전체 실패(예: redis 장애)가 프로세스를 죽이지 않도록 삼킨다.
      this.logger.error({ err: error }, 'idle sweep 실패');
    } finally {
      this.running = false;
    }
  }
}
