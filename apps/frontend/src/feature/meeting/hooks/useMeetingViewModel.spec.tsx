import {
  type JoinMeetingAck,
  type JoinMeetingResponse,
  MEETING_WS_EVENTS,
} from '@convene/shared-interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';

import { getHostToken, saveHostToken } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

import { useMeetingViewModel } from './useMeetingViewModel';

/**
 * Socket.IO 클라이언트의 최소 인터페이스만 흉내내는 fake.
 * 테스트가 직접 `trigger(event, payload)`를 호출해 서버 측 broadcast를 모사한다.
 */
class FakeSocket {
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  connected = false;
  readonly emit = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.connected = false;
  });

  // socket.io의 timeout().emit() 체이닝. 같은 emit mock으로 이어지게 self를 돌려준다.
  timeout(_ms: number): this {
    return this;
  }

  on(event: string, fn: (...args: unknown[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
    return this;
  }

  off(event: string, fn: (...args: unknown[]) => void): this {
    const list = this.listeners.get(event);
    if (list === undefined) return this;
    this.listeners.set(
      event,
      list.filter((x) => x !== fn),
    );
    return this;
  }

  trigger(event: string, ...args: unknown[]): void {
    (this.listeners.get(event) ?? []).forEach((fn) => fn(...args));
  }
}

let fakeSocket: FakeSocket;

const { pushMock, replaceMock, routerMock } = vi.hoisted(() => {
  const pushMock = vi.fn();
  const replaceMock = vi.fn();
  return {
    pushMock,
    replaceMock,
    routerMock: { push: pushMock, replace: replaceMock } as const,
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/shared/socket/meeting.socket', () => ({
  connectMeetingSocket: () => fakeSocket,
}));

const closeMeetingMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/meeting.api', () => ({
  closeMeeting: closeMeetingMock,
}));

const code = 'abc12xyz';

const setup = (nickname: string | null = '준', enabled = true) => {
  useSessionStore.setState({ nickname });
  fakeSocket = new FakeSocket();
  pushMock.mockReset();
  replaceMock.mockReset();
  closeMeetingMock.mockReset();
  return renderHook(() => useMeetingViewModel(code, enabled));
};

/** join emit에 실린 ack 콜백을 꺼내 서버 응답을 흉내낸다. */
const ackJoin = (ack: JoinMeetingResponse | null, err: Error | null = null): void => {
  const call = fakeSocket.emit.mock.calls.find((c) => c[0] === MEETING_WS_EVENTS.JOIN);
  act(() => {
    (call?.[2] as (e: Error | null, payload?: JoinMeetingResponse) => void)(err, ack ?? undefined);
  });
};

/** connect 후 서버가 join을 승인한 상태까지 진행한다. */
const defaultAck: JoinMeetingAck = {
  ok: true,
  hostToken: null,
  participantId: 'p-1',
  reconnected: false,
  chat: [],
};

const connect = (ack: JoinMeetingAck = defaultAck): void => {
  act(() => {
    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
  });
  ackJoin(ack);
};

describe('useMeetingViewModel', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('닉네임이 store에 없으면 홈으로 redirect 하지 않고 socket도 만들지 않는다 (직접 접속 닉네임 모달용)', () => {
    const { result } = setup(null);
    // 링크 직접 접속(미인증)은 홈으로 튕기지 않고 회의 페이지에서 닉네임 입력을 받는다.
    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
  });

  it('mount + connect 시 meeting:join을 emit 한다', () => {
    const { result } = setup('준');
    connect();
    expect(fakeSocket.emit).toHaveBeenCalledWith(
      MEETING_WS_EVENTS.JOIN,
      { code, nickname: '준', participantId: expect.any(String) },
      expect.any(Function),
    );
    expect(result.current.status).toBe('joined');
  });

  it('participantJoined 브로드캐스트 수신 시 원격 참가자 목록에 추가', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        participantId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toEqual([
      { participantId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z', disconnected: false },
    ]);
  });

  it('participantLeft 브로드캐스트 수신 시 목록에서 제거', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        participantId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_LEFT, {
        participantId: 's2',
        leftAt: '2026-01-01T00:02:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toEqual([]);
  });

  it('같은 participantId가 다시 join 되면 중복되지 않고 갱신된다', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        participantId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        participantId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toHaveLength(1);
  });

  it('connect_error 발생 시 status="error" + 메시지 노출', async () => {
    const { result } = setup('준');
    act(() => {
      fakeSocket.trigger('connect_error', new Error('handshake 실패'));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('handshake 실패');
  });

  it('unmount 시 meeting:leave emit + socket.disconnect 호출', () => {
    const { unmount } = setup('준');
    connect();
    fakeSocket.emit.mockClear();
    unmount();
    expect(fakeSocket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('mount 후 socket 인스턴스를 외부에 노출한다 (chat/미디어 hook 공유 용)', () => {
    const { result } = setup('준');
    expect(result.current.socket).toBe(fakeSocket);
  });

  it('닉네임 없으면(redirect) socket은 null로 유지된다', () => {
    const { result } = setup(null);
    expect(result.current.socket).toBeNull();
  });

  it('leave() 호출 시 meeting:leave emit + 닉네임 clear + 홈으로 push', () => {
    const { result } = setup('준');
    connect();
    fakeSocket.emit.mockClear();
    act(() => {
      result.current.leave();
    });
    expect(fakeSocket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    expect(useSessionStore.getState().nickname).toBeNull();
    expect(pushMock).toHaveBeenCalledWith('/');
  });

  describe('isHost', () => {
    it('회의 code에 대한 hostToken이 저장돼 있으면 isHost=true', () => {
      saveHostToken(code, 'tok-host');
      const { result } = setup('준');
      expect(result.current.isHost).toBe(true);
    });

    it('hostToken이 없으면 isHost=false(회의 입장자/비-host)', () => {
      const { result } = setup('준');
      expect(result.current.isHost).toBe(false);
    });

    it('빈 방에 처음 들어가 join 응답으로 hostToken을 받으면 host가 된다', () => {
      const { result } = setup('준');

      connect({ ...defaultAck, hostToken: 'tok-granted' });

      expect(result.current.isHost).toBe(true);
      expect(getHostToken(code)).toBe('tok-granted');
    });

    it('host를 못 받은 응답(null)은 기존 토큰을 지우지 않는다', () => {
      saveHostToken(code, 'tok-host');
      const { result } = setup('준');

      connect({ ...defaultAck, hostToken: null });

      expect(result.current.isHost).toBe(true);
      expect(getHostToken(code)).toBe('tok-host');
    });

    it('host가 아닌 참가자는 join 응답 후에도 non-host로 남는다', () => {
      const { result } = setup('준');

      connect({ ...defaultAck, hostToken: null });

      expect(result.current.isHost).toBe(false);
    });
  });

  describe('join 응답 대기', () => {
    it('응답을 받기 전에는 joined가 아니다 (방이 열리기 전 미디어 협상 방지)', () => {
      const { result } = setup('준');

      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });

      expect(result.current.status).toBe('connecting');
    });

    it('join 응답이 실패하면 error 상태가 된다', () => {
      const { result } = setup('준');
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });

      ackJoin(null, new Error('operation has timed out'));

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).not.toBeNull();
    });
  });

  describe('입장 거부', () => {
    const rejectJoin = (): void => {
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin({ ok: false, reason: 'not-found' });
    };

    it('없는 회의라는 응답을 받으면 status="not-found"가 되고 입장이 막힌다', () => {
      const { result } = setup('준');
      rejectJoin();
      expect(result.current.status).toBe('not-found');
      expect(result.current.entryBlock).toBe('not-found');
      expect(result.current.errorMessage).not.toBeNull();
    });

    it('종료된 회의는 status="closed"로 구분해 입장을 막는다', () => {
      const { result } = setup('준');
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin({ ok: false, reason: 'closed' });
      expect(result.current.status).toBe('closed');
      expect(result.current.entryBlock).toBe('closed');
      expect(fakeSocket.disconnect).toHaveBeenCalled();
    });

    it('닉네임 중복은 차단 화면 대신 닉네임을 비워 다시 입력받는다', () => {
      const { result } = setup('준');
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin({ ok: false, reason: 'nickname-taken' });
      expect(result.current.nickname).toBeNull();
      expect(result.current.nicknameError).not.toBeNull();
      expect(result.current.entryBlock).toBeNull();
      expect(fakeSocket.disconnect).toHaveBeenCalled();
    });

    it('닉네임 중복이어도 participantId·hostToken은 지우지 않는다', () => {
      saveHostToken(code, 'host-1');
      const { result } = setup('준');
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin({ ok: false, reason: 'nickname-taken' });
      expect(getHostToken(code)).toBe('host-1');
      expect(result.current.nickname).toBeNull();
    });

    it('없는 회의는 재시도해도 달라지지 않으므로 socket을 끊는다', () => {
      setup('준');
      rejectJoin();
      expect(fakeSocket.disconnect).toHaveBeenCalled();
    });

    it('거부로 끊긴 소켓은 재연결 중으로 표시하지 않는다', () => {
      const { result } = setup('준');
      rejectJoin();
      act(() => {
        fakeSocket.trigger('disconnect');
      });
      expect(result.current.status).toBe('not-found');
    });

    it('한 번도 입장하지 못한 채 실패하면 회의 화면을 열지 않는다', () => {
      const { result } = setup('준');
      act(() => {
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin(null, new Error('operation has timed out'));
      expect(result.current.entryBlock).toBe('failed');
    });

    it('입장해도 되는지 확인되기 전(enabled=false)에는 socket을 만들지 않는다', () => {
      const { result } = setup('준', false);
      expect(result.current.socket).toBeNull();
      expect(fakeSocket.emit).not.toHaveBeenCalled();
    });

    it('입장한 뒤의 재입장 실패는 회의 화면을 닫지 않는다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.connected = false;
        fakeSocket.trigger('disconnect');
        fakeSocket.connected = true;
        fakeSocket.trigger('connect');
      });
      ackJoin(null, new Error('operation has timed out'));
      expect(result.current.status).toBe('error');
      expect(result.current.entryBlock).toBeNull();
    });
  });

  describe('endMeeting()', () => {
    it('DELETE /meetings/:code를 호출하고 성공 시 닉네임 clear + /reports로 push', async () => {
      closeMeetingMock.mockResolvedValueOnce({
        code,
        endedAt: '2026-01-01T00:30:00.000Z',
      });
      const { result } = setup('준');
      connect();
      fakeSocket.emit.mockClear();
      await act(async () => {
        await result.current.endMeeting();
      });
      // hostToken 저장이 없으면 undefined로 호출(backend가 host 아님으로 거부).
      expect(closeMeetingMock).toHaveBeenCalledWith(code, undefined);
      expect(useSessionStore.getState().nickname).toBeNull();
      expect(pushMock).toHaveBeenCalledWith('/reports');
      // 닉네임이 비워져도 미인증 홈 redirect와 경쟁하지 않는다("(미인증)" 깜박임 방지).
      expect(replaceMock).not.toHaveBeenCalledWith('/');
    });

    it('저장된 hostToken을 closeMeeting에 함께 전달한다', async () => {
      saveHostToken(code, 'tok-host');
      closeMeetingMock.mockResolvedValueOnce({
        code,
        endedAt: '2026-01-01T00:30:00.000Z',
      });
      const { result } = setup('준');
      connect();
      await act(async () => {
        await result.current.endMeeting();
      });
      expect(closeMeetingMock).toHaveBeenCalledWith(code, 'tok-host');
    });

    it('성공 시 leave처럼 socket도 disconnect 한다(중복 leave 이벤트 차단)', async () => {
      closeMeetingMock.mockResolvedValueOnce({
        code,
        endedAt: '2026-01-01T00:30:00.000Z',
      });
      const { result } = setup('준');
      connect();
      await act(async () => {
        await result.current.endMeeting();
      });
      expect(fakeSocket.disconnect).toHaveBeenCalled();
    });

    it('DELETE가 실패해도 사용자 경험을 깨지 않고 /reports로 이동한다', async () => {
      closeMeetingMock.mockRejectedValueOnce(new Error('Meeting is already closed'));
      const { result } = setup('준');
      connect();
      await act(async () => {
        await result.current.endMeeting();
      });
      expect(pushMock).toHaveBeenCalledWith('/reports');
      expect(useSessionStore.getState().nickname).toBeNull();
    });

    it('성공 후 cleanup에서 meeting:leave를 다시 emit 하지 않는다(이미 종료된 회의 race 방지)', async () => {
      closeMeetingMock.mockResolvedValueOnce({
        code,
        endedAt: '2026-01-01T00:30:00.000Z',
      });
      const { result, unmount } = setup('준');
      connect();
      await act(async () => {
        await result.current.endMeeting();
      });
      fakeSocket.emit.mockClear();
      unmount();
      expect(fakeSocket.emit).not.toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    });
  });

  describe('meeting:ended broadcast (자동 종료 브로드캐스트 수신)', () => {
    it('수신 시 닉네임 clear + socket.disconnect + /reports로 push', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.ENDED, {
          code,
          endedAt: '2026-01-01T00:30:00.000Z',
        });
      });
      // result.current도 함께 갱신됨을 부수적으로 확인
      void result.current;
      expect(useSessionStore.getState().nickname).toBeNull();
      expect(fakeSocket.disconnect).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith('/reports');
      // 닉네임이 비워져도 미인증 홈 redirect와 경쟁하지 않는다("(미인증)" 깜박임 방지).
      expect(replaceMock).not.toHaveBeenCalledWith('/');
    });

    it('수신 후 cleanup에서 meeting:leave를 emit 하지 않는다(이미 종료됨)', () => {
      const { unmount } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.ENDED, {
          code,
          endedAt: '2026-01-01T00:30:00.000Z',
        });
      });
      fakeSocket.emit.mockClear();
      unmount();
      expect(fakeSocket.emit).not.toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    });

    it('수신 시 closeMeeting API는 호출하지 않는다(backend가 이미 종료한 회의)', () => {
      setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.ENDED, {
          code,
          endedAt: '2026-01-01T00:30:00.000Z',
        });
      });
      expect(closeMeetingMock).not.toHaveBeenCalled();
    });
  });

  it('자동 재연결 시(connect 두 번째 발생) JOIN을 다시 emit 한다', () => {
    setup('준');
    connect(); // 첫 connect
    fakeSocket.emit.mockClear();
    act(() => {
      fakeSocket.trigger('connect'); // 재연결 시뮬
    });
    expect(fakeSocket.emit).toHaveBeenCalledWith(
      MEETING_WS_EVENTS.JOIN,
      { code, nickname: '준', participantId: expect.any(String) },
      expect.any(Function),
    );
  });

  it('자동 재연결 시 remoteParticipants가 초기화되어 stale 항목이 제거된다', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        participantId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toHaveLength(1);
    act(() => {
      fakeSocket.trigger('connect'); // 재연결
    });
    expect(result.current.remoteParticipants).toEqual([]);
  });

  it('rejoinGen은 소켓 재연결이 아니라 재입장 ack이 와야 증가한다', () => {
    const { result } = setup('준');
    connect();
    expect(result.current.rejoinGen).toBe(0);

    // 소켓만 다시 붙은 시점 — 서버는 아직 이 소켓의 신원을 모른다.
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(result.current.rejoinGen).toBe(0);

    ackJoin(defaultAck);
    expect(result.current.rejoinGen).toBe(1);

    act(() => {
      fakeSocket.trigger('connect');
    });
    ackJoin(defaultAck);
    expect(result.current.rejoinGen).toBe(2);
  });

  describe('비정상 종료와 재접속', () => {
    it('회의별 안정 participantId를 지참해 join 한다 — 재연결에서도 같은 값', () => {
      setup('준');
      connect();
      const first = fakeSocket.emit.mock.calls.find((c) => c[0] === MEETING_WS_EVENTS.JOIN)?.[1] as {
        participantId: string;
      };
      act(() => {
        fakeSocket.trigger('connect');
      });
      const calls = fakeSocket.emit.mock.calls.filter((c) => c[0] === MEETING_WS_EVENTS.JOIN);
      expect((calls[1][1] as { participantId: string }).participantId).toBe(first.participantId);
    });

    it('소켓이 끊기면 화면을 떠나지 않고 reconnecting 상태가 된다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger('disconnect');
      });
      expect(result.current.status).toBe('reconnecting');
      expect(pushMock).not.toHaveBeenCalled();
    });

    it('입장 전 끊김은 reconnecting으로 올리지 않는다 (방보다 미디어 협상이 앞서면 안 된다)', () => {
      const { result } = setup('준');
      act(() => {
        fakeSocket.trigger('disconnect');
      });
      expect(result.current.status).toBe('connecting');
    });

    it('재연결 시도 중 connect_error는 오류로 올리지 않는다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger('connect_error', new Error('ECONNREFUSED'));
      });
      expect(result.current.status).not.toBe('error');
    });

    it('상대의 연결 끊김은 목록에서 제거하지 않고 disconnected로만 표시한다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
          participantId: 'p-2',
          nickname: '아',
          joinedAt: '2026-01-01T00:01:00.000Z',
        });
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED, {
          participantId: 'p-2',
          disconnectedAt: '2026-01-01T00:02:00.000Z',
        });
      });
      expect(result.current.remoteParticipants).toEqual([
        {
          participantId: 'p-2',
          nickname: '아',
          joinedAt: '2026-01-01T00:01:00.000Z',
          disconnected: true,
        },
      ]);
    });

    it('상대가 복귀하면 disconnected가 풀린다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
          participantId: 'p-2',
          nickname: '아',
          joinedAt: '2026-01-01T00:01:00.000Z',
        });
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED, {
          participantId: 'p-2',
          disconnectedAt: '2026-01-01T00:02:00.000Z',
        });
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED, {
          participantId: 'p-2',
          reconnectedAt: '2026-01-01T00:02:10.000Z',
        });
      });
      expect(result.current.remoteParticipants[0].disconnected).toBe(false);
    });

    it('참가자 스냅숏의 disconnected 상태를 그대로 반영한다', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANTS, {
          participants: [
            {
              participantId: 'p-2',
              nickname: '아',
              joinedAt: '2026-01-01T00:01:00.000Z',
              disconnected: true,
            },
          ],
        });
      });
      expect(result.current.remoteParticipants[0].disconnected).toBe(true);
    });

    it('ack의 채팅 히스토리를 노출해 끊긴 구간의 대화를 복원할 수 있게 한다', () => {
      const { result } = setup('준');
      const chat = [{ nickname: '아', text: '먼저 시작할게요', sentAt: '2026-01-01T00:00:10.000Z' }];
      connect({ ...defaultAck, chat });
      expect(result.current.chatHistory).toEqual(chat);
    });

    it('리로드·탭 닫기(pagehide)에서는 leave를 emit 하지 않는다 (유예 경로를 타야 한다)', () => {
      const { unmount } = setup('준');
      connect();
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      unmount();
      expect(fakeSocket.emit).not.toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    });

    it('정상 퇴장은 이 회의의 모든 보관 상태를 지운다 (재입장 시 되살아나지 않게)', () => {
      const { result } = setup('준');
      connect();
      window.sessionStorage.setItem('hostToken:abc12xyz', 'tok');
      window.sessionStorage.setItem('mediaIntent:abc12xyz', '{"audio":true,"video":false}');
      act(() => {
        result.current.leave();
      });
      expect(window.sessionStorage.getItem('nickname:abc12xyz')).toBeNull();
      expect(window.sessionStorage.getItem('hostToken:abc12xyz')).toBeNull();
      expect(window.sessionStorage.getItem('participantId:abc12xyz')).toBeNull();
      expect(window.sessionStorage.getItem('mediaIntent:abc12xyz')).toBeNull();
    });

    it('회의 종료 broadcast로 떠날 때도 전부 지운다', () => {
      setup('준');
      connect();
      window.sessionStorage.setItem('mediaIntent:abc12xyz', '{"audio":true,"video":true}');
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.ENDED, {
          code,
          endedAt: '2026-01-01T00:30:00.000Z',
        });
      });
      expect(window.sessionStorage.getItem('mediaIntent:abc12xyz')).toBeNull();
      expect(window.sessionStorage.getItem('participantId:abc12xyz')).toBeNull();
    });

    it('비정상 종료(pagehide)에서는 보관 상태를 지우지 않는다 — 재접속의 전제다', () => {
      setup('준');
      connect();
      window.sessionStorage.setItem('mediaIntent:abc12xyz', '{"audio":true,"video":false}');
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(window.sessionStorage.getItem('participantId:abc12xyz')).not.toBeNull();
      expect(window.sessionStorage.getItem('mediaIntent:abc12xyz')).not.toBeNull();
    });

    it('일반 unmount는 그대로 leave를 emit 한다', () => {
      const { unmount } = setup('준');
      connect();
      unmount();
      expect(fakeSocket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.LEAVE, { code });
    });
  });
});
