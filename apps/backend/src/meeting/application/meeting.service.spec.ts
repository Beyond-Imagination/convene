import { externalReference } from '../../shared-kernel/domain/value-objects';
import { Meeting } from '../domain/meeting';
import { IdleTimeout, MeetingCode } from '../domain/value-objects';
import { MeetingService } from './meeting.service';

const code = MeetingCode.from('abc12xyz');

const makeMeeting = (startedAt: Date) =>
  Meeting.create({
    code,
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt,
  });

describe('MeetingService.createMeeting', () => {
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
      codeGenerator: { next: () => code },
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
    expect(result.code).toBe(code);
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

describe('MeetingService.joinMeeting', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');

  const makeService = (meeting: Meeting | null) => {
    const saved: Meeting[] = [];
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      codeGenerator: { next: () => code },
      clock: { now: () => t1 },
    });
    return { service, saved };
  };

  it('해당 code 회의에 참가자를 추가하고 Meeting+Participant를 반환한다', async () => {
    const meeting = makeMeeting(t0);
    const { service } = makeService(meeting);
    const result = await service.joinMeeting({
      code: 'abc12xyz',
      participantId: 's1',
      nickname: 'alice',
    });
    expect(result.meeting).toBe(meeting);
    expect(result.participant.id).toBe('s1');
    expect(result.participant.nickname).toBe('alice');
    expect(result.participant.joinedAt).toBe(t1);
    expect(meeting.activeParticipantCount).toBe(1);
  });

  it('Repository.save에 갱신된 Meeting을 전달한다', async () => {
    const meeting = makeMeeting(t0);
    const { service, saved } = makeService(meeting);
    await service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(meeting);
  });

  it('Repository에 없는 code면 throw', async () => {
    const { service } = makeService(null);
    await expect(
      service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' }),
    ).rejects.toThrow(/not found/);
  });

  it('이미 종료된 Meeting이면 Aggregate 에러가 그대로 전파된다', async () => {
    const meeting = makeMeeting(t0);
    meeting.close(t0);
    const { service } = makeService(meeting);
    await expect(
      service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' }),
    ).rejects.toThrow(/already closed/);
  });
});

describe('MeetingService.leaveMeeting', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');
  const t2 = new Date('2026-01-01T00:02:00Z');

  const makeMeetingWithParticipant = () => {
    const m = makeMeeting(t0);
    m.addParticipant('s1', 'alice', t1);
    return m;
  };

  const makeService = (meeting: Meeting | null) => {
    const saved: Meeting[] = [];
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      codeGenerator: { next: () => code },
      clock: { now: () => t2 },
    });
    return { service, saved };
  };

  it('해당 code 회의의 참가자를 leave 처리하고 갱신된 Meeting을 반환한다', async () => {
    const meeting = makeMeetingWithParticipant();
    const { service, saved } = makeService(meeting);
    const m = await service.leaveMeeting({ code: 'abc12xyz', participantId: 's1' });
    expect(m).toBe(meeting);
    expect(m.activeParticipantCount).toBe(0);
    expect(saved[0]).toBe(meeting);
  });

  it('Repository에 없는 code면 throw', async () => {
    const { service } = makeService(null);
    await expect(
      service.leaveMeeting({ code: 'abc12xyz', participantId: 's1' }),
    ).rejects.toThrow(/not found/);
  });

  it('없는 participantId면 Aggregate 에러가 그대로 전파된다', async () => {
    const meeting = makeMeetingWithParticipant();
    const { service } = makeService(meeting);
    await expect(
      service.leaveMeeting({ code: 'abc12xyz', participantId: 'unknown' }),
    ).rejects.toThrow(/not found/);
  });
});
