import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/** 시간당 전체 상한. 누구나 부르는 공개 엔드포인트가 노션 이슈 DB를 도배하지 않게 막는다. */
export const BUG_REPORT_RATE_LIMITS = { report: 30, image: 60 } as const;

export type BugReportRateKind = keyof typeof BUG_REPORT_RATE_LIMITS;

const WINDOW_SECONDS = 60 * 60;

@Injectable()
export class BugReportRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly clock: SystemClock,
  ) {}

  /** 이번 시간 칸의 몫을 하나 쓴다. 상한을 넘었으면 false. */
  async tryAcquire(kind: BugReportRateKind): Promise<boolean> {
    const hour = this.clock.now().toISOString().slice(0, 13);
    const key = `bug-report:${kind}:${hour}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
    return count <= BUG_REPORT_RATE_LIMITS[kind];
  }
}
