import { externalReference } from '../../shared-kernel/domain/value-objects';
import { Meeting } from '../domain/meeting';
import { IdleTimeout, MeetingCode } from '../domain/value-objects';
import { MeetingService } from './meeting.service';

describe('MeetingService.createMeeting', () => {
  const fakeCode = MeetingCode.from('abc12xyz');
  const fakeNow = new Date('2026-01-01T00:00:00Z');

  const makeService = () => {
    const saved: Meeting[] = [];
    const service = new MeetingService({
      repository: {
        save: async (m) => {
          saved.push(m);
        },
        findByCode: async () => null,
      },
      codeGenerator: { next: () => fakeCode },
      clock: { now: () => fakeNow },
    });
    return { service, saved };
  };

  it('CodeGenerator로 받은 code와 Clock.now()로 Meeting을 생성한다', async () => {
    const { service } = makeService();
    const result = await service.createMeeting({
      source: 'web',
      externalReference: externalReference(),
    });
    expect(result.code).toBe(fakeCode);
    expect(result.source).toBe('web');
    expect(result.startedAt).toBe(fakeNow);
    expect(result.isOpen).toBe(true);
  });

  it('생성된 Meeting의 idleTimeout은 기본값(10분)을 사용한다', async () => {
    const { service } = makeService();
    const result = await service.createMeeting({
      source: 'web',
      externalReference: externalReference(),
    });
    expect(result.idleTimeout.milliseconds).toBe(IdleTimeout.DEFAULT_MS);
  });

  it('Repository.save에 생성된 Meeting 인스턴스를 그대로 전달한다', async () => {
    const { service, saved } = makeService();
    const result = await service.createMeeting({
      source: 'web',
      externalReference: externalReference(),
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(result);
  });

  it('externalReference와 source를 그대로 Meeting에 전달한다', async () => {
    const { service } = makeService();
    const ref = externalReference({ issueId: 'NTN-1' });
    const result = await service.createMeeting({
      source: 'notion-issue',
      externalReference: ref,
    });
    expect(result.externalReference).toBe(ref);
    expect(result.source).toBe('notion-issue');
  });
});
