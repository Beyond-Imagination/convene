import { MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import type { Socket } from 'socket.io';

import { MeetingNotFoundError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { ChatDto, JoinMeetingDto, LeaveMeetingDto } from '@/meeting/interface/meeting.dto';
import { chatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

import { MeetingGateway } from './meeting.gateway';

const fakeLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

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
    hostToken: 'host-token-1',
    title: null,
  });

interface Broadcast {
  room: string;
  except?: string;
  event: string;
  payload: unknown;
}

const makeSocket = (id: string) => {
  const joined = new Set<string>();
  const broadcasts: Broadcast[] = [];
  const data: { code?: string; participantId?: string } = {};
  const selfEmits: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id,
    rooms: joined,
    data,
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
    emit(event: string, payload: unknown): boolean {
      selfEmits.push({ event, payload });
      return true;
    },
  };
  return { socket, joined, broadcasts, data, selfEmits };
};

const dtoOf = (
  overrides: Partial<Pick<JoinMeetingDto, 'code' | 'nickname' | 'participantId'>> = {},
): JoinMeetingDto => {
  const dto = new JoinMeetingDto();
  dto.code = overrides.code ?? 'abc12xyz';
  dto.nickname = overrides.nickname ?? 'alice';
  if (overrides.participantId !== undefined) dto.participantId = overrides.participantId;
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
      const target = {
        except(except: string) {
          return {
            emit(event: string, payload: unknown): boolean {
              broadcasts.push({ room, except, event, payload });
              return true;
            },
          };
        },
        emit(event: string, payload: unknown): boolean {
          broadcasts.push({ room, event, payload });
          return true;
        },
      };
      return target;
    },
  };
  return { server, broadcasts };
};

describe('MeetingGateway.handleJoin', () => {
  const makeGateway = (reconnected = false, chat = [] as ReturnType<typeof chatEntry>[]) => {
    const meeting = makeMeeting();
    const participant = meeting.addParticipant('p-1', 'alice', t1, 's1');
    const calls: Array<{
      code: string;
      participantId: string;
      connectionId: string;
      nickname: string;
    }> = [];
    const service = {
      joinMeeting: jest.fn(async (cmd: (typeof calls)[number]) => {
        calls.push(cmd);
        return { meeting, participant, hostToken: 'host-token-1', reconnected, chat };
      }),
    };

    const gateway = new MeetingGateway(service as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, service, calls, meeting, broadcasts };
  };

  it('dto의 안정 participantId와 이번 소켓 연결(connectionId)을 함께 넘긴다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(calls).toEqual([
      { code: 'abc12xyz', participantId: 'p-1', connectionId: 's1', nickname: 'alice' },
    ]);
  });

  it('participantId를 보내지 않는 구버전 클라이언트는 socket.id를 신원으로 쓴다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleJoin(dtoOf(), socket as unknown as Socket);
    expect(calls[0].participantId).toBe('s1');
  });

  it('회의 room과 참가자 전용 room 두 곳에 join 시킨다', async () => {
    const { gateway } = makeGateway();
    const { socket, joined } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(joined.has('meeting:abc12xyz')).toBe(true);
    // socket.id가 바뀌어도 이 참가자를 지목·제외할 수 있게 하는 room.
    expect(joined.has('p-1')).toBe(true);
  });

  it('handleDisconnect가 복원할 수 있도록 socket.data에 code와 participantId를 저장한다', async () => {
    const { gateway } = makeGateway();
    const { socket, data } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(data).toEqual({ code: 'abc12xyz', participantId: 'p-1' });
  });

  it('ack에 확정된 participantId·재접속 여부·채팅 히스토리를 담아 돌려준다', async () => {
    const history = [chatEntry({ nickname: 'bob', text: '먼저 시작할게요', sentAt: t1 })];
    const { gateway } = makeGateway(true, history);
    const { socket } = makeSocket('s1');
    const ack = await gateway.handleJoin(
      dtoOf({ participantId: 'p-1' }),
      socket as unknown as Socket,
    );
    expect(ack).toEqual({
      ok: true,
      hostToken: 'host-token-1',
      participantId: 'p-1',
      reconnected: true,
      chat: [{ nickname: 'bob', text: '먼저 시작할게요', sentAt: t1.toISOString() }],
    });
  });

  it('본인에게만 기존 참가자 스냅숏을 보내며 자기 자신은 제외한다', async () => {
    const { gateway, meeting } = makeGateway();
    meeting.addParticipant('p-2', 'bob', t1, 's2');
    const { socket, selfEmits } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(selfEmits).toEqual([
      {
        event: MEETING_WS_EVENTS.PARTICIPANTS,
        payload: {
          participants: [
            {
              participantId: 'p-2',
              nickname: 'bob',
              joinedAt: t1.toISOString(),
              disconnected: false,
            },
          ],
        },
      },
    ]);
  });

  it('스냅숏은 지금 끊겨 있는 참가자를 disconnected로 표시한다', async () => {
    const { gateway, meeting } = makeGateway();
    meeting.addParticipant('p-2', 'bob', t1, 's2');
    meeting.disconnectParticipant('s2', t1);
    const { socket, selfEmits } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    const payload = selfEmits[0].payload as { participants: Array<{ disconnected: boolean }> };
    expect(payload.participants[0].disconnected).toBe(true);
  });

  it('참가자 입장 broadcast는 handleJoin이 직접 보내지 않는다 (도메인 이벤트 구독이 담당)', async () => {
    const { gateway, broadcasts } = makeGateway();
    const { socket, broadcasts: clientBroadcasts } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(broadcasts).toEqual([]);
    expect(clientBroadcasts).toEqual([]);
  });
});

describe('MeetingGateway.handleJoin 거부', () => {
  const makeGateway = (error: unknown) => {
    const service = {
      joinMeeting: jest.fn(async () => {
        throw error;
      }),
    };
    const gateway = new MeetingGateway(service as never, fakeLogger as never);
    const { server } = makeServer();
    gateway.server = server as never;
    return { gateway };
  };

  it('없는 회의면 예외로 끊지 않고 거부 사유를 ack으로 돌려준다', async () => {
    const { gateway } = makeGateway(new MeetingNotFoundError('abc12xyz'));
    const { socket } = makeSocket('s1');
    const ack = await gateway.handleJoin(
      dtoOf({ participantId: 'p-1' }),
      socket as unknown as Socket,
    );
    expect(ack).toEqual({ ok: false, reason: 'not-found' });
  });

  it('거부된 참가자는 어떤 room에도 넣지 않고 socket.data도 남기지 않는다', async () => {
    const { gateway } = makeGateway(new MeetingNotFoundError('abc12xyz'));
    const { socket, joined, data, selfEmits } = makeSocket('s1');
    await gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket);
    expect(joined.size).toBe(0);
    expect(data).toEqual({});
    expect(selfEmits).toEqual([]);
  });

  it('없는 회의가 아닌 오류는 그대로 던진다', async () => {
    const { gateway } = makeGateway(new Error('redis down'));
    const { socket } = makeSocket('s1');
    await expect(
      gateway.handleJoin(dtoOf({ participantId: 'p-1' }), socket as unknown as Socket),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('MeetingGateway 참가자 상태 broadcast', () => {
  const makeGateway = () => {
    const gateway = new MeetingGateway({} as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, broadcasts };
  };

  it('입장은 본인을 제외한 같은 room에 알린다', () => {
    const { gateway, broadcasts } = makeGateway();
    gateway.onParticipantJoined({
      code: 'abc12xyz',
      participantId: 'p-1',
      nickname: 'alice',
      joinedAt: t1,
    });
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        except: 'p-1',
        event: MEETING_WS_EVENTS.PARTICIPANT_JOINED,
        payload: { participantId: 'p-1', nickname: 'alice', joinedAt: t1.toISOString() },
      },
    ]);
  });

  it('퇴장은 스케줄러가 일으킨 유예 만료도 같은 경로로 알린다', () => {
    const { gateway, broadcasts } = makeGateway();
    gateway.onParticipantLeft({ code: 'abc12xyz', participantId: 'p-1', leftAt: t1 });
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        except: 'p-1',
        event: MEETING_WS_EVENTS.PARTICIPANT_LEFT,
        payload: { participantId: 'p-1', leftAt: t1.toISOString() },
      },
    ]);
  });

  it('연결 끊김은 퇴장과 별개 채널로 알린다 (수신 측이 타일을 지우지 않게)', () => {
    const { gateway, broadcasts } = makeGateway();
    gateway.onParticipantDisconnected({
      code: 'abc12xyz',
      participantId: 'p-1',
      disconnectedAt: t1,
    });
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        except: 'p-1',
        event: MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED,
        payload: { participantId: 'p-1', disconnectedAt: t1.toISOString() },
      },
    ]);
  });

  it('재접속은 입장이 아니라 복구로 알린다', () => {
    const { gateway, broadcasts } = makeGateway();
    gateway.onParticipantReconnected({
      code: 'abc12xyz',
      participantId: 'p-1',
      reconnectedAt: t1,
    });
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        except: 'p-1',
        event: MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED,
        payload: { participantId: 'p-1', reconnectedAt: t1.toISOString() },
      },
    ]);
  });
});

describe('MeetingGateway.handleLeave', () => {
  const makeGateway = (leave?: jest.Mock) => {
    const calls: Array<{ code: string; participantId: string }> = [];
    const service = {
      leaveMeeting:
        leave ??
        jest.fn(async (cmd: { code: string; participantId: string }) => {
          calls.push(cmd);
          return {};
        }),
    };

    const gateway = new MeetingGateway(service as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, calls, broadcasts };
  };

  it('socket.data의 안정 participantId로 leaveMeeting을 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket, data } = makeSocket('s1');
    data.participantId = 'p-1';
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', participantId: 'p-1' }]);
  });

  it('회의 room과 참가자 room 양쪽에서 빠진다', async () => {
    const { gateway } = makeGateway();
    const { socket, joined, data } = makeSocket('s1');
    data.participantId = 'p-1';
    joined.add('meeting:abc12xyz');
    joined.add('p-1');
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(joined.has('meeting:abc12xyz')).toBe(false);
    expect(joined.has('p-1')).toBe(false);
  });

  it('퇴장 처리 즉시 socket.data.code를 비워 뒤따르는 disconnect가 되살리지 못하게 한다', async () => {
    const { gateway } = makeGateway();
    const { socket, data } = makeSocket('s1');
    data.code = 'abc12xyz';
    data.participantId = 'p-1';
    await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(data.code).toBeUndefined();
  });

  it('leaveMeeting이 throw 해도(이미 종료된 회의 등) swallow + room 정리 + ok 반환', async () => {
    const leave = jest.fn(async () => {
      throw new Error('Cannot removeParticipant: meeting is already closed');
    });
    const { gateway } = makeGateway(leave);
    const { socket, joined, data } = makeSocket('s1');
    data.participantId = 'p-1';
    joined.add('meeting:abc12xyz');
    const result = await gateway.handleLeave(leaveDtoOf(), socket as unknown as Socket);
    expect(result).toEqual({ ok: true });
    expect(joined.has('meeting:abc12xyz')).toBe(false);
  });
});

describe('MeetingGateway.handleDisconnect', () => {
  const makeGateway = (disconnect?: jest.Mock) => {
    const calls: Array<{ code: string; connectionId: string }> = [];
    const leaveMeeting = jest.fn();
    const service = {
      leaveMeeting,
      disconnectParticipant:
        disconnect ??
        jest.fn(async (cmd: { code: string; connectionId: string }) => {
          calls.push(cmd);
          return undefined;
        }),
    };

    const gateway = new MeetingGateway(service as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, calls, broadcasts, leaveMeeting };
  };

  it('퇴장이 아니라 유예 대기로 넘긴다 — 소켓 연결로 disconnectParticipant를 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket, data } = makeSocket('s1');
    data.code = 'abc12xyz';
    data.participantId = 'p-1';
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', connectionId: 's1' }]);
  });

  it('leaveMeeting은 호출하지 않는다 (유예 만료는 스케줄러가 확정한다)', async () => {
    const { gateway, leaveMeeting } = makeGateway();
    const { socket, data } = makeSocket('s1');
    data.code = 'abc12xyz';
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(leaveMeeting).not.toHaveBeenCalled();
  });

  it('socket.data.code가 없으면 service 호출 없이 조용히 종료한다(join 전 disconnect)', async () => {
    const { gateway, calls } = makeGateway();
    const { socket } = makeSocket('s1');
    await gateway.handleDisconnect(socket as unknown as Socket);
    expect(calls).toEqual([]);
  });

  it('service가 throw해도 swallow한다', async () => {
    const disconnect = jest.fn(async () => {
      throw new Error('redis down');
    });
    const { gateway } = makeGateway(disconnect);
    const { socket, data } = makeSocket('s1');
    data.code = 'abc12xyz';
    await expect(gateway.handleDisconnect(socket as unknown as Socket)).resolves.toBeUndefined();
  });
});

describe('MeetingGateway.onMeetingEnded', () => {
  const tEnded = new Date('2026-01-01T00:30:00Z');

  const makeGateway = () => {
    const gateway = new MeetingGateway({} as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, broadcasts };
  };

  // 본 핸들러 검증에는 payload의 code/endedAt만 사용된다. 나머지 도메인 필드는
  // ReportMeetingLifecycleListener 등 다른 구독자가 처리하며 본 spec의 관심사가 아니다.
  const payload = {
    code: 'abc12xyz',
    source: 'web' as const,
    meetingType: 'general' as const,
    externalReference: externalReference(),
    startedAt: t0,
    endedAt: tEnded,
    participants: [],
    chat: [],
    reason: 'manual' as const,
    title: null,
  };

  it('meeting.ended 페이로드를 받아 같은 room 전체에 meeting:ended를 broadcast 한다', () => {
    const { gateway, broadcasts } = makeGateway();
    gateway.onMeetingEnded(payload);
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        event: MEETING_WS_EVENTS.ENDED,
        payload: { code: 'abc12xyz', endedAt: tEnded.toISOString() },
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

    const gateway = new MeetingGateway(service as never, fakeLogger as never);
    const { server, broadcasts } = makeServer();
    gateway.server = server as never;
    return { gateway, service, calls, broadcasts };
  };

  it('socket.data의 안정 participantId로 postChat을 호출한다', async () => {
    const { gateway, calls } = makeGateway();
    const { socket, data } = makeSocket('s1');
    data.participantId = 'p-1';
    await gateway.handleChat(chatDtoOf(), socket as unknown as Socket);
    expect(calls).toEqual([{ code: 'abc12xyz', participantId: 'p-1', text: 'hello' }]);
  });

  it('자신을 포함한 같은 room 전체에 chatPosted를 브로드캐스트한다', async () => {
    const { gateway, broadcasts } = makeGateway();
    const { socket, broadcasts: clientBroadcasts } = makeSocket('s1');
    await gateway.handleChat(chatDtoOf(), socket as unknown as Socket);
    expect(broadcasts).toEqual([
      {
        room: 'meeting:abc12xyz',
        event: MEETING_WS_EVENTS.CHAT_POSTED,
        payload: { nickname: 'alice', text: 'hello', sentAt: tChat.toISOString() },
      },
    ]);
    expect(clientBroadcasts).toEqual([]);
  });

  it('postChat이 throw하면 broadcast하지 않는다', async () => {
    const { gateway, broadcasts } = makeGateway();
    (gateway as unknown as { service: { postChat: jest.Mock } }).service.postChat = jest.fn(
      async () => {
        throw new Error('Meeting "abc12xyz" not found');
      },
    );
    const { socket } = makeSocket('s1');
    await expect(gateway.handleChat(chatDtoOf(), socket as unknown as Socket)).rejects.toThrow(
      /not found/,
    );
    expect(broadcasts).toEqual([]);
  });
});
