import {
  NotionMeetingProvisioningService,
  PollOutcome,
} from '@/notion/application/notion-meeting-provisioning.service';
import { NotionPollingScheduler } from '@/notion/application/notion-polling.scheduler';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

function silentLogger(): PinoLoggerAdapter {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop } as unknown as PinoLoggerAdapter;
}

function fixedClock(now: Date): SystemClock {
  return { now: () => now };
}

const NOTHING_FOUND: PollOutcome = { found: 0, provisioned: 0 };

describe('NotionPollingScheduler.poll', () => {
  it('clock 시각으로 provisioning.pollPendingIssues를 호출한다', async () => {
    const now = new Date('2026-07-20T00:00:00.000Z');
    const times: Date[] = [];
    const provisioning = {
      pollPendingIssues: async (t: Date): Promise<PollOutcome> => {
        times.push(t);
        return NOTHING_FOUND;
      },
    } as unknown as NotionMeetingProvisioningService;

    await new NotionPollingScheduler(provisioning, fixedClock(now), silentLogger()).poll();

    expect(times).toEqual([now]);
  });

  it('이전 폴링이 진행 중이면 재진입을 건너뛴다', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provisioning = {
      pollPendingIssues: async (): Promise<PollOutcome> => {
        calls += 1;
        await gate;
        return NOTHING_FOUND;
      },
    } as unknown as NotionMeetingProvisioningService;
    const scheduler = new NotionPollingScheduler(provisioning, fixedClock(new Date()), silentLogger());

    const first = scheduler.poll();
    await scheduler.poll();

    expect(calls).toBe(1);
    release();
    await first;
  });

  it('폴링 전체가 throw해도 삼키고 running을 해제해 다음 폴링을 허용한다', async () => {
    let calls = 0;
    const provisioning = {
      pollPendingIssues: async (): Promise<PollOutcome> => {
        calls += 1;
        throw new Error('notion down');
      },
    } as unknown as NotionMeetingProvisioningService;
    const scheduler = new NotionPollingScheduler(provisioning, fixedClock(new Date()), silentLogger());

    await expect(scheduler.poll()).resolves.toBeUndefined();
    await scheduler.poll();

    expect(calls).toBe(2);
  });
});
