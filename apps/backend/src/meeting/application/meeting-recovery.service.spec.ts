import { MEETING_EVENTS } from '@convene/shared-interfaces';

import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { LoggerPort } from '@/shared-kernel/domain/ports';
import { ChatEntry, externalReference } from '@/shared-kernel/domain/value-objects';

import { MeetingService } from './meeting.service';
import { MeetingRecoveryService } from './meeting-recovery.service';

interface CapturedEvent {
  name: string;
  payload: unknown;
}

const noopLogger = (): LoggerPort => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

const CRASHED_AT = new Date('2026-01-01T00:00:00Z');
const BOOTED_AT = new Date('2026-01-01T00:05:00Z');

const makeMeeting = (rawCode: string): Meeting =>
  Meeting.create({
    code: MeetingCode.from(rawCode),
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: CRASHED_AT,
    hostToken: `host-${rawCode}`,
    title: null,
  });

/** 재시작 직전 상태의 redis를 흉내내는 in-memory repository. */
const makeRepository = (meetings: Meeting[]) => {
  const stored = new Map<string, Meeting>();
  const openCodes = new Set<string>();
  for (const m of meetings) {
    stored.set(m.code.value, m);
    if (m.isOpen) openCodes.add(m.code.value);
  }
  const repository: MeetingRepository = {
    findByCode: async (code) => stored.get(code) ?? null,
    save: async (meeting) => {
      const code = meeting.code.value;
      stored.set(code, meeting);
      if (meeting.isOpen) openCodes.add(code);
      else openCodes.delete(code);
    },
    listOpenCodes: async () => Array.from(openCodes),
  };
  return { repository, stored };
};

const makeRecovery = (meetings: Meeting[]) => {
  const events: CapturedEvent[] = [];
  const eventPublisher = {
    publish: async (name: string, payload: unknown): Promise<void> => {
      events.push({ name, payload });
    },
  };
  const { repository, stored } = makeRepository(meetings);
  const clock = { now: (): Date => BOOTED_AT };
  const meetingService = new MeetingService(
      repository,
      { append: async () => {}, listByCode: async (): Promise<ChatEntry[]> => [] },
      { next: () => MeetingCode.from('unused123') },
      { next: () => 'unused' },
      clock,
      eventPublisher,
      noopLogger(),
    );
  const service = new MeetingRecoveryService(
      repository,
      meetingService,
      clock,
      eventPublisher,
      noopLogger(),
    );
  return { service, events, stored, repository };
};

const eventNames = (events: CapturedEvent[], name: string): CapturedEvent[] =>
  events.filter((e) => e.name === name);

describe('MeetingRecoveryService.recover', () => {
  it('열린 회의마다 meeting.opened를 다시 발행해 방을 다시 열게 한다', async () => {
    const meeting = makeMeeting('alive123');
    const { service, events } = makeRecovery([meeting]);

    await service.recover();

    expect(eventNames(events, MEETING_EVENTS.OPENED)).toEqual([
      { name: MEETING_EVENTS.OPENED, payload: { code: 'alive123' } },
    ]);
  });

  it('재시작을 넘긴 참가자를 모두 leave 처리한다', async () => {
    const meeting = makeMeeting('ghost123');
    meeting.addParticipant('socket-a', '가', CRASHED_AT);
    meeting.addParticipant('socket-b', '나', CRASHED_AT);
    const { service, stored } = makeRecovery([meeting]);

    await service.recover();

    expect(stored.get('ghost123')?.activeParticipantCount).toBe(0);
  });

  it('유령 참가자마다 meeting.participant.left를 발행해 미디어 자원 정리를 트리거한다', async () => {
    const meeting = makeMeeting('ghost123');
    meeting.addParticipant('socket-a', '가', CRASHED_AT);
    meeting.addParticipant('socket-b', '나', CRASHED_AT);
    const { service, events } = makeRecovery([meeting]);

    await service.recover();

    const left = eventNames(events, MEETING_EVENTS.PARTICIPANT_LEFT).map(
      (e) => (e.payload as { participantId: string }).participantId,
    );
    expect(left).toEqual(['socket-a', 'socket-b']);
  });

  it('유령을 정리한 회의는 lastActiveAt을 부팅 시각으로 당겨 재접속 유예를 준다', async () => {
    const meeting = makeMeeting('ghost123');
    meeting.addParticipant('socket-a', '가', CRASHED_AT);
    const { service, stored } = makeRecovery([meeting]);

    await service.recover();

    expect(stored.get('ghost123')?.lastActiveAt).toEqual(BOOTED_AT);
  });

  it('참가자가 없던 회의는 lastActiveAt을 건드리지 않는다', async () => {
    const meeting = makeMeeting('empty123');
    const { service, stored } = makeRecovery([meeting]);

    await service.recover();

    expect(stored.get('empty123')?.lastActiveAt).toEqual(CRASHED_AT);
  });

  it('복구한 회의 수와 정리한 참가자 수를 돌려준다', async () => {
    const first = makeMeeting('first123');
    first.addParticipant('socket-a', '가', CRASHED_AT);
    const second = makeMeeting('secnd123');

    const { service } = makeRecovery([first, second]);

    await expect(service.recover()).resolves.toEqual({
      scanned: 2,
      reopened: 2,
      detachedParticipants: 1,
    });
  });

  it('한 회의의 복구가 실패해도 나머지 회의를 계속 복구한다', async () => {
    const broken = makeMeeting('broken12');
    const healthy = makeMeeting('health12');
    const { service, repository, events } = makeRecovery([broken, healthy]);
    const original = repository.findByCode.bind(repository);
    repository.findByCode = async (code: string): Promise<Meeting | null> => {
      if (code === 'broken12') throw new Error('redis read failed');
      return original(code);
    };

    const outcome = await service.recover();

    expect(outcome.reopened).toBe(1);
    expect(eventNames(events, MEETING_EVENTS.OPENED)).toHaveLength(1);
  });

  it('열린 회의를 훑지 못해도 부팅을 막지 않는다', async () => {
    const { service, repository } = makeRecovery([]);
    repository.listOpenCodes = async (): Promise<string[]> => {
      throw new Error('redis down');
    };

    await expect(service.recover()).resolves.toEqual({
      scanned: 0,
      reopened: 0,
      detachedParticipants: 0,
    });
  });
});
