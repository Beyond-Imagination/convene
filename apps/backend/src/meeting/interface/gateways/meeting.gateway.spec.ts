import type { Socket } from 'socket.io';

import { MEETING_WS_EVENTS } from '@migration/shared-interfaces';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import {
  chatEntry,
  externalReference,
} from '@/shared-kernel/domain/value-objects';

import { ChatDto } from '@/meeting/interface/dto/chat.dto';
import { JoinMeetingDto } from '@/meeting/interface/dto/join-meeting.dto';
import { LeaveMeetingDto } from '@/meeting/interface/dto/leave-meeting.dto';

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
    async leave(room: string): Promise<void> {
      joined.delete(room);
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

const leaveDtoOf = (code = 'abc12xyz'): LeaveMeetingDto => {
  const dto = new LeaveMeetingDto();
  dto.code = code;
  return dto;
};

const chatDtoOf = (code = 'abc12xyz', text = 'hello'): ChatDto => {
  const dto = new ChatDto();
  dto.code = code;
  dto.text = text;
  return dto;
};

const makeServer = () => {
  const broadcasts: Broadcast[] = [];
  const server = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown): boolean {
          broadcasts.push({ room, event, payload });
          return true;
        },
      };
    },
  };
  return { server, broadcasts };
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

describe('MeetingGateway.handleLeave', () => {
  const t2 = new Date('2026-01-01T00:02:00Z');

  const makeGateway = () => {
    const meeting = makeMeeting();
    const participant = meeting.addParticipant('s1', 'alice', t1);
    participant.leave(t2);
    const calls: Array<{ code: string; participantId: string }> = [];
    const service = {
      leaveMeeting: jest.fn(async (cmd: { code: string; participantId: string }) => {
        calls.push(cmd);
        return { meeting, participant };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new MeetingGateway(service as any);
    return { gateway, service, calls };
  };

  it('service.leaveMeeting을 socket.id를 participantId로 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', participantId: 's1' }]);
  });

  it('소켓을 meeting:{code} room에서 leave 시킨다', async () => {
    const { gateway } = makeGateway();
    const { socket, joined } = makeSocket('s1');
    joined.add('meeting:abc12xyz');
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(joined.has('meeting:abc12xyz')).toBe(false);
  });

  it('같은 room의 남은 참가자에게 participantLeft 브로드캐스트', async () => {
    const { gateway } = makeGateway();
    const { socket, broadcasts } = makeSocket('s1');
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        event: MEETING_WS_EVENTS.PARTICIPANT_LEFT,
        payload: {
          socketId: 's1',
          leftAt: t2.toISOString(),
        },
      },
    ]);
  });
});

describe('MeetingGateway.handleChat', () => {
  const tChat = new Date('2026-01-01T00:03:00Z');

  const makeGateway = () => {
    const entry = chatEntry({ nickname: 'alice', text: 'hello', sentAt: tChat });
    const calls: Array<{ code: string; participantId: string; text: string }> = [];
    const service = {
      postChat: jest.fn(async (cmd: { code: string; participantId: string; text: string }) => {
        calls.push(cmd);
        return entry;
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway = new MeetingGateway(service as any);
    const { server, broadcasts: serverBroadcasts } = makeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gateway.server = server as any;
    return { gateway, service, calls, entry, serverBroadcasts };
  };

  it('service.postChat을 socket.id를 participantId로 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleChat(chatDtoOf(), socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', participantId: 's1', text: 'hello' }]);
  });

  it('자신을 포함한 같은 room 전체에 chatPosted를 브로드캐스트한다 (server.to)', async () => {
    const { gateway, serverBroadcasts } = makeGateway();
    const { socket, broadcasts: clientBroadcasts } = makeSocket('s1');
    await gateway.handleChat(chatDtoOf(), socket as unknown as Socket);
    expect(serverBroadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        event: MEETING_WS_EVENTS.CHAT_POSTED,
        payload: {
          nickname: 'alice',
          text: 'hello',
          sentAt: tChat.toISOString(),
        },
      },
    ]);
    // client.to(...)로는 발송하지 않는다 — 자신도 받아야 하므로 server.to만 사용.
    expect(clientBroadcasts).toEqual([]);
  });

  it('service.postChat이 throw하면 broadcast하지 않는다', async () => {
    const { gateway, serverBroadcasts } = makeGateway();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway as any).service.postChat = jest.fn(async () => {
      throw new Error('Meeting "abc12xyz" not found');
    });
    const { socket } = makeSocket('s1');
    await expect(
      gateway.handleChat(chatDtoOf(), socket as unknown as Socket),
    ).rejects.toThrow(/not found/);
    expect(serverBroadcasts).toEqual([]);
  });
});

