import Redis from 'ioredis';

export const BUG_REPORT_RATE_LIMITS = { report: 30, image: 60 } as const;

export type BugReportRateKind = keyof typeof BUG_REPORT_RATE_LIMITS;

export class BugReportRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly clock: { now(): Date },
  ) {}

  async tryAcquire(_kind: BugReportRateKind): Promise<boolean> {
    throw new Error('not implemented');
  }
}
