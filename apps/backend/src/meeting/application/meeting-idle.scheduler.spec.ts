import { IdleSweepOutcome, MeetingService } from '@/meeting/application/meeting.service';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import { MeetingIdleScheduler } from './meeting-idle.scheduler';

function silentLogger(): PinoLoggerAdapter {
  return stub<PinoLoggerAdapter>({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });
}

const NOTHING_CLOSED: IdleSweepOutcome = { scanned: 0, closed: 0 };

describe('MeetingIdleScheduler.sweep', () => {
  it('회의 sweep 유스케이스를 호출한다', async () => {
    const service = stub<MeetingService>({
      sweepIdleMeetings: jest.fn(async () => NOTHING_CLOSED),
    });

    await new MeetingIdleScheduler(service, silentLogger()).sweep();

    expect(service.sweepIdleMeetings).toHaveBeenCalledTimes(1);
  });

  it('이전 sweep이 진행 중이면 재진입을 건너뛴다', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = stub<MeetingService>({
      sweepIdleMeetings: async (): Promise<IdleSweepOutcome> => {
        calls += 1;
        await gate;
        return NOTHING_CLOSED;
      },
    });
    const scheduler = new MeetingIdleScheduler(service, silentLogger());

    const first = scheduler.sweep();
    await scheduler.sweep();

    expect(calls).toBe(1);
    release();
    await first;
  });

  it('sweep이 throw해도 삼키고 다음 주기를 허용한다', async () => {
    let calls = 0;
    const service = stub<MeetingService>({
      sweepIdleMeetings: async (): Promise<IdleSweepOutcome> => {
        calls += 1;
        throw new Error('redis down');
      },
    });
    const scheduler = new MeetingIdleScheduler(service, silentLogger());

    await expect(scheduler.sweep()).resolves.toBeUndefined();
    await scheduler.sweep();

    expect(calls).toBe(2);
  });
});
