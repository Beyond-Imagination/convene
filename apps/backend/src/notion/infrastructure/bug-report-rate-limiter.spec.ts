import RedisMock from 'ioredis-mock';

import { BUG_REPORT_RATE_LIMITS, BugReportRateLimiter } from './bug-report-rate-limiter';

describe('BugReportRateLimiter', () => {
  let now: Date;
  let limiter: BugReportRateLimiter;

  beforeEach(async () => {
    const redis = new RedisMock();
    await redis.flushall();
    now = new Date('2026-10-14T05:10:00.000Z');
    limiter = new BugReportRateLimiter(redis, { now: () => now });
  });

  it('한 시간 동안 상한까지만 허용한다', async () => {
    for (let i = 0; i < BUG_REPORT_RATE_LIMITS.report; i++) {
      expect(await limiter.tryAcquire('report')).toBe(true);
    }
    expect(await limiter.tryAcquire('report')).toBe(false);
  });

  it('다음 시간이 되면 다시 허용한다', async () => {
    for (let i = 0; i < BUG_REPORT_RATE_LIMITS.report; i++) await limiter.tryAcquire('report');
    now = new Date('2026-10-14T06:00:00.000Z');
    expect(await limiter.tryAcquire('report')).toBe(true);
  });

  it('접수와 이미지는 따로 센다', async () => {
    for (let i = 0; i < BUG_REPORT_RATE_LIMITS.report; i++) await limiter.tryAcquire('report');
    expect(await limiter.tryAcquire('image')).toBe(true);
  });
});
