import type { Socket } from 'socket.io';

import { MEETING_WS_EVENTS } from '@migration/shared-interfaces';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { externalReference } from '@/shared-kernel/domain/value-objects';

import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';

import { MeetingGateway } from './meeting.gateway';

const fakeCode = MeetingCode.from('abc12xyz');
const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-01T00:01:00Z');

const makeMeeting = () =>
  Meeting.create({
    code: fakeCode,
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: t0,
  });

interface Broadcast {
  room: string;
  event: string;
  payload: unknown;
}

const makeSocket = (id: string) => {
  const joined = new Set<string>();
  const broadcasts: Broadcast[] = [];
  const socket = {
    id,
    rooms: joined,
    async join(room: string): Promise<void> {
      joined.add(room);
    },
    to(room: string) {
      return {
        emit(event: string, payload: unknown): boolean {
          broadcasts.push({ room, event, payload });
          return true;
        },
      };
    },
  };
  return { socket, joined, broadcasts };
};

const dtoOf = (code = 'abc12xyz', nickname = 'alice'): JoinMeetingDto => {
  const dto = new JoinMeetingDto();
  dto.code = code;
  dto.nickname = nickname;
  return dto;
};

describe('MeetingGateway.handleJoin', () => {
  const makeGateway = () => {
    const meeting = makeMeeting();
    const participant = meeting.addParticipant('s1', 'alice', t1);
    const calls: Array<{ code: string; participantId: string; nickname: string }> = [];
    const service = {
      joinMeeting: jest.fn(async (cmd: { code: string; participantId: string; nickname: string }) => {
        calls.push(cmd);
        return { meeting, participant };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new MeetingGateway(service as any);
    return { gateway, service, calls };
  };

  it('service.joinMeeting을 socket.id를 participantId로 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleJoin(dtoOf(), socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', participantId: 's1', nickname: 'alice' }]);
  });

  it('소켓을 meeting:{code} room에 join 시킨다', async () => {
    const { gateway } = makeGateway();
    const { socket, joined } = makeSocket('s1');
    await gateway.handleJoin(dtoOf(), socket as unknown as Socket);
    expect(joined.has('meeting:abc12xyz')).toBe(true);
  });

  it('같은 room의 다른 참가자에게 participantJoined 브로드캐스트', async () => {
    const { gateway } = makeGateway();
    const { socket, broadcasts } = makeSocket('s1');
    await gateway.handleJoin(dtoOf(), socket as unknown as Socket);
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        event: MEETING_WS_EVENTS.PARTICIPANT_JOINED,
        payload: {
          socketId: 's1',
          nickname: 'alice',
          joinedAt: t1.toISOString(),
        },
      },
    ]);
  });
});
