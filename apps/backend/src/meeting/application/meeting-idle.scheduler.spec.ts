import { IdleSweepOutcome, MeetingService } from '@/meeting/application/meeting.service';
import { LoggerPort } from '@/shared-kernel/domain/ports';

import { MeetingIdleScheduler } from './meeting-idle.scheduler';

function silentLogger(): LoggerPort {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

const NOTHING_CLOSED: IdleSweepOutcome = { scanned: 0, closed: 0 };

describe('MeetingIdleScheduler.sweep', () => {
  it('회의 sweep 유스케이스를 호출한다', async () => {
    const service = {
      sweepIdleMeetings: jest.fn(async () => NOTHING_CLOSED),
    } as unknown as MeetingService;

    await new MeetingIdleScheduler(service, silentLogger()).sweep();

    expect(service.sweepIdleMeetings).toHaveBeenCalledTimes(1);
  });

  it('이전 sweep이 진행 중이면 재진입을 건너뛴다', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = {
      sweepIdleMeetings: async (): Promise<IdleSweepOutcome> => {
        calls += 1;
        await gate;
        return NOTHING_CLOSED;
      },
    } as unknown as MeetingService;
    const scheduler = new MeetingIdleScheduler(service, silentLogger());

    const first = scheduler.sweep();
    await scheduler.sweep();

    expect(calls).toBe(1);
    release();
    await first;
  });

  it('sweep이 throw해도 삼키고 다음 주기를 허용한다', async () => {
    let calls = 0;
    const service = {
      sweepIdleMeetings: async (): Promise<IdleSweepOutcome> => {
        calls += 1;
        throw new Error('redis down');
      },
    } as unknown as MeetingService;
    const scheduler = new MeetingIdleScheduler(service, silentLogger());

    await expect(scheduler.sweep()).resolves.toBeUndefined();
    await scheduler.sweep();

    expect(calls).toBe(2);
  });
});
