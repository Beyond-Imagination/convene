import { MEETING_EVENTS } from '@migration/shared-interfaces';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import {
  ChatEntry,
  chatEntry,
  externalReference,
  NO_EXTERNAL_REFERENCE,
} from '@/shared-kernel/domain/value-objects';

import { MeetingNotFoundError } from './meeting.errors';
import { MeetingService } from './meeting.service';

interface CapturedEvent {
  name: string;
  payload: unknown;
}

const makeEventPublisher = () => {
  const events: CapturedEvent[] = [];
  return {
    events,
    publisher: {
      publish: async (name: string, payload: unknown): Promise<void> => {
        events.push({ name, payload });
      },
    },
  };
};

const code = MeetingCode.from('abc12xyz');

const makeMeeting = (startedAt: Date) =>
  Meeting.create({
    code,
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt,
  });

const noopChatRepository = () => ({
  append: async () => {},
  listByCode: async (): Promise<ChatEntry[]> => [],
});

describe('MeetingService.createMeeting', () => {
  const fakeNow = new Date('2026-01-01T00:00:00Z');

  const makeService = () => {
    const saved: Meeting[] = [];
    const { events, publisher } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        save: async (m) => {
          saved.push(m);
        },
        findByCode: async () => null,
      },
      chatRepository: noopChatRepository(),
      codeGenerator: { next: () => code },
      clock: { now: () => fakeNow },
      eventPublisher: publisher,
    });
    return { service, saved, events };
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

  it('생성 후 meeting.created 도메인 이벤트를 발행한다', async () => {
    const { service, events } = makeService();
    await service.createMeeting({ source: 'web', externalReference: externalReference() });
    expect(events).toEqual([
      {
        name: MEETING_EVENTS.CREATED,
        payload: { code: code.value, source: 'web', startedAt: fakeNow },
      },
    ]);
  });
});

describe('MeetingService.joinMeeting', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');

  const makeService = (meeting: Meeting | null) => {
    const saved: Meeting[] = [];
    const { events, publisher } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: noopChatRepository(),
      codeGenerator: { next: () => code },
      clock: { now: () => t1 },
      eventPublisher: publisher,
    });
    return { service, saved, events };
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

  it('Repository에 없는 code면 MeetingNotFoundError를 던진다', async () => {
    const { service } = makeService(null);
    await expect(
      service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' }),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);
  });

  it('이미 종료된 Meeting이면 Aggregate 에러가 그대로 전파된다', async () => {
    const meeting = makeMeeting(t0);
    meeting.close(t0);
    const { service } = makeService(meeting);
    await expect(
      service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' }),
    ).rejects.toThrow(/already closed/);
  });

  it('성공 시 meeting.participant.joined 도메인 이벤트를 발행한다', async () => {
    const meeting = makeMeeting(t0);
    const { service, events } = makeService(meeting);
    await service.joinMeeting({ code: 'abc12xyz', participantId: 's1', nickname: 'alice' });
    expect(events).toEqual([
      {
        name: MEETING_EVENTS.PARTICIPANT_JOINED,
        payload: { code: 'abc12xyz', participantId: 's1', nickname: 'alice', joinedAt: t1 },
      },
    ]);
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
    const { events, publisher } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: noopChatRepository(),
      codeGenerator: { next: () => code },
      clock: { now: () => t2 },
      eventPublisher: publisher,
    });
    return { service, saved, events };
  };

  it('해당 code 회의의 참가자를 leave 처리하고 Meeting+떠난 Participant를 반환한다', async () => {
    const meeting = makeMeetingWithParticipant();
    const { service, saved } = makeService(meeting);
    const result = await service.leaveMeeting({ code: 'abc12xyz', participantId: 's1' });
    expect(result.meeting).toBe(meeting);
    expect(result.meeting.activeParticipantCount).toBe(0);
    expect(result.participant.id).toBe('s1');
    expect(result.participant.nickname).toBe('alice');
    expect(result.participant.leftAt).toBe(t2);
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

  it('성공 시 meeting.participant.left 도메인 이벤트를 발행한다', async () => {
    const meeting = makeMeetingWithParticipant();
    const { service, events } = makeService(meeting);
    await service.leaveMeeting({ code: 'abc12xyz', participantId: 's1' });
    expect(events).toEqual([
      {
        name: MEETING_EVENTS.PARTICIPANT_LEFT,
        payload: { code: 'abc12xyz', participantId: 's1', leftAt: t2 },
      },
    ]);
  });
});

describe('MeetingService.postChat', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');
  const t2 = new Date('2026-01-01T00:02:00Z');

  const makeMeetingActive = () => {
    const m = makeMeeting(t0);
    m.addParticipant('s1', 'alice', t1);
    return m;
  };

  const makeService = (meeting: Meeting | null) => {
    const saved: Meeting[] = [];
    const appended: { code: string; entry: ChatEntry }[] = [];
    const { publisher } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: {
        append: async (c, entry) => {
          appended.push({ code: c, entry });
        },
        listByCode: async () => appended.map((a) => a.entry),
      },
      codeGenerator: { next: () => code },
      clock: { now: () => t2 },
      eventPublisher: publisher,
    });
    return { service, saved, appended };
  };

  it('정상 발화 시 socket.id로 nickname을 lookup해 ChatEntry를 만들고 append + markActive + save', async () => {
    const meeting = makeMeetingActive();
    const { service, saved, appended } = makeService(meeting);
    const entry = await service.postChat({
      code: 'abc12xyz',
      participantId: 's1',
      text: 'hello',
    });
    expect(entry.nickname).toBe('alice');
    expect(entry.text).toBe('hello');
    expect(entry.sentAt).toBe(t2);
    expect(appended).toEqual([{ code: 'abc12xyz', entry }]);
    expect(meeting.lastActiveAt).toBe(t2);
    expect(saved[0]).toBe(meeting);
  });

  it('Repository에 없는 code면 throw, append 호출 안 됨', async () => {
    const { service, appended } = makeService(null);
    await expect(
      service.postChat({ code: 'abc12xyz', participantId: 's1', text: 'hi' }),
    ).rejects.toThrow(/not found/);
    expect(appended).toHaveLength(0);
  });

  it('Meeting에 없는 participantId면 throw, append 호출 안 됨', async () => {
    const meeting = makeMeetingActive();
    const { service, appended } = makeService(meeting);
    await expect(
      service.postChat({ code: 'abc12xyz', participantId: 'unknown', text: 'hi' }),
    ).rejects.toThrow(/participant/i);
    expect(appended).toHaveLength(0);
  });

  it('이미 종료된 Meeting이면 Aggregate 에러 전파, append 호출 안 됨', async () => {
    const meeting = makeMeetingActive();
    meeting.close(t1);
    const { service, appended } = makeService(meeting);
    await expect(
      service.postChat({ code: 'abc12xyz', participantId: 's1', text: 'hi' }),
    ).rejects.toThrow(/already closed/);
    expect(appended).toHaveLength(0);
  });

  it('잘못된 text(빈 문자열)는 ChatEntry factory가 거부 → append 호출 안 됨', async () => {
    const meeting = makeMeetingActive();
    const { service, appended } = makeService(meeting);
    await expect(
      service.postChat({ code: 'abc12xyz', participantId: 's1', text: '   ' }),
    ).rejects.toThrow(/text/);
    expect(appended).toHaveLength(0);
  });
});

describe('MeetingService.closeMeeting', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2026-01-01T00:01:00Z');
  const tClose = new Date('2026-01-01T00:30:00Z');

  const makeService = (meeting: Meeting | null) => {
    const saved: Meeting[] = [];
    const { publisher, events } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: noopChatRepository(),
      codeGenerator: { next: () => code },
      clock: { now: () => tClose },
      eventPublisher: publisher,
    });
    return { service, saved, events };
  };

  it('Meeting.close를 호출하고 save한 뒤 meeting.ended 이벤트를 발행한다', async () => {
    const meeting = makeMeeting(t0);
    meeting.addParticipant('s1', 'alice', t1);
    const { service, saved, events } = makeService(meeting);
    const result = await service.closeMeeting({ code: 'abc12xyz', reason: 'manual' });
    expect(result).toBe(meeting);
    expect(meeting.isOpen).toBe(false);
    expect(meeting.endedAt).toBe(tClose);
    expect(saved[0]).toBe(meeting);
    expect(events).toEqual([
      {
        name: MEETING_EVENTS.ENDED,
        payload: {
          code: 'abc12xyz',
          source: 'web',
          externalReference: NO_EXTERNAL_REFERENCE,
          startedAt: t0,
          endedAt: tClose,
          reason: 'manual',
          participants: [{ id: 's1', nickname: 'alice', joinedAt: t1, leftAt: tClose }],
          chat: [],
        },
      },
    ]);
  });

  it('meeting.ended payload의 chat은 ChatRepository.listByCode 결과를 그대로 담는다', async () => {
    const meeting = makeMeeting(t0);
    meeting.addParticipant('s1', 'alice', t1);
    const accumulated: ChatEntry[] = [
      chatEntry({ nickname: 'alice', text: '안녕', sentAt: t1 }),
    ];
    const saved: Meeting[] = [];
    const { publisher, events } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (c === 'abc12xyz' ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: {
        append: async () => {},
        listByCode: async () => accumulated,
      },
      codeGenerator: { next: () => code },
      clock: { now: () => tClose },
      eventPublisher: publisher,
    });
    await service.closeMeeting({ code: 'abc12xyz', reason: 'manual' });
    const endedEvent = events.find((e) => e.name === MEETING_EVENTS.ENDED);
    expect(endedEvent?.payload).toMatchObject({ chat: accumulated });
  });

  it('Repository에 없는 code면 throw, 이벤트 발행 안 됨', async () => {
    const { service, events } = makeService(null);
    await expect(
      service.closeMeeting({ code: 'abc12xyz', reason: 'manual' }),
    ).rejects.toThrow(/not found/);
    expect(events).toHaveLength(0);
  });

  it('이미 종료된 Meeting이면 Aggregate 에러 전파, 이벤트 발행 안 됨', async () => {
    const meeting = makeMeeting(t0);
    meeting.close(t1);
    const { service, events } = makeService(meeting);
    await expect(
      service.closeMeeting({ code: 'abc12xyz', reason: 'manual' }),
    ).rejects.toThrow(/already closed/);
    expect(events).toHaveLength(0);
  });
});

describe('MeetingService.detectIdleAndClose', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const tJoin = new Date('2026-01-01T00:01:00Z');
  const tLeave = new Date('2026-01-01T00:02:00Z');
  const tWithinIdle = new Date('2026-01-01T00:10:00Z'); // tLeave + 8m < 10m
  const tIdleElapsed = new Date('2026-01-01T00:12:30Z'); // tLeave + 10m30s ≥ 10m

  const makeService = (meeting: Meeting | null, now: Date) => {
    const saved: Meeting[] = [];
    const { publisher, events } = makeEventPublisher();
    const service = new MeetingService({
      repository: {
        findByCode: async (c) => (meeting && c === meeting.code.value ? meeting : null),
        save: async (m) => {
          saved.push(m);
        },
      },
      chatRepository: noopChatRepository(),
      codeGenerator: { next: () => code },
      clock: { now: () => now },
      eventPublisher: publisher,
    });
    return { service, saved, events };
  };

  const makeIdleMeeting = () => {
    const m = makeMeeting(t0);
    m.addParticipant('s1', 'alice', tJoin);
    m.removeParticipant('s1', tLeave);
    return m;
  };

  it('활성 참가자가 있으면 close하지 않고 false 반환, 이벤트 발행 안 됨', async () => {
    const m = makeMeeting(t0);
    m.addParticipant('s1', 'alice', tJoin);
    const { service, saved, events } = makeService(m, tIdleElapsed);
    const closed = await service.detectIdleAndClose({ code: 'abc12xyz' });
    expect(closed).toBe(false);
    expect(m.isOpen).toBe(true);
    expect(saved).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('idle 임계 미달이면 close하지 않고 false 반환', async () => {
    const m = makeIdleMeeting();
    const { service, events } = makeService(m, tWithinIdle);
    const closed = await service.detectIdleAndClose({ code: 'abc12xyz' });
    expect(closed).toBe(false);
    expect(m.isOpen).toBe(true);
    expect(events).toHaveLength(0);
  });

  it('idle 조건 충족 시 close + meeting.idle.detected + meeting.ended 두 이벤트 발행', async () => {
    const m = makeIdleMeeting();
    const { service, saved, events } = makeService(m, tIdleElapsed);
    const closed = await service.detectIdleAndClose({ code: 'abc12xyz' });
    expect(closed).toBe(true);
    expect(m.isOpen).toBe(false);
    expect(m.endedAt).toBe(tIdleElapsed);
    expect(saved[0]).toBe(m);
    expect(events).toEqual([
      {
        name: MEETING_EVENTS.IDLE_DETECTED,
        payload: { code: 'abc12xyz', detectedAt: tIdleElapsed },
      },
      {
        name: MEETING_EVENTS.ENDED,
        payload: {
          code: 'abc12xyz',
          source: 'web',
          externalReference: NO_EXTERNAL_REFERENCE,
          startedAt: t0,
          endedAt: tIdleElapsed,
          reason: 'idle',
          participants: [{ id: 's1', nickname: 'alice', joinedAt: tJoin, leftAt: tLeave }],
          chat: [],
        },
      },
    ]);
  });

  it('이미 종료된 Meeting은 멱등하게 no-op(false) 반환, 이벤트 발행 안 됨', async () => {
    const m = makeMeeting(t0);
    m.close(t0);
    const { service, saved, events } = makeService(m, tIdleElapsed);
    const closed = await service.detectIdleAndClose({ code: 'abc12xyz' });
    expect(closed).toBe(false);
    expect(saved).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('Repository에 없는 code면 throw, 이벤트 발행 안 됨', async () => {
    const { service, events } = makeService(null, tIdleElapsed);
    await expect(service.detectIdleAndClose({ code: 'abc12xyz' })).rejects.toThrow(/not found/);
    expect(events).toHaveLength(0);
  });
});
