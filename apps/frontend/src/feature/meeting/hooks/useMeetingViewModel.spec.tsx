import { type JoinMeetingAck, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';

import { getHostToken, saveHostToken } from '@/shared/stores/host-token.storage';
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

const setup = (nickname: string | null = '준') => {
  useSessionStore.setState({ nickname });
  fakeSocket = new FakeSocket();
  pushMock.mockReset();
  replaceMock.mockReset();
  closeMeetingMock.mockReset();
  return renderHook(() => useMeetingViewModel(code));
};

/** join emit에 실린 ack 콜백을 꺼내 서버 응답을 흉내낸다. */
const ackJoin = (ack: JoinMeetingAck | null, err: Error | null = null): void => {
  const call = fakeSocket.emit.mock.calls.find((c) => c[0] === MEETING_WS_EVENTS.JOIN);
  act(() => {
    (call?.[2] as (e: Error | null, payload?: JoinMeetingAck) => void)(err, ack ?? undefined);
  });
};

/** connect 후 서버가 join을 승인한 상태까지 진행한다. */
const connect = (ack: JoinMeetingAck = { ok: true, hostToken: null }): void => {
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
      { code, nickname: '준' },
      expect.any(Function),
    );
    expect(result.current.status).toBe('joined');
  });

  it('participantJoined 브로드캐스트 수신 시 원격 참가자 목록에 추가', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        socketId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toEqual([
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
    ]);
  });

  it('participantLeft 브로드캐스트 수신 시 목록에서 제거', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        socketId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_LEFT, {
        socketId: 's2',
        leftAt: '2026-01-01T00:02:00.000Z',
      });
    });
    expect(result.current.remoteParticipants).toEqual([]);
  });

  it('같은 socketId가 다시 join 되면 중복되지 않고 갱신된다', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        socketId: 's2',
        nickname: '아',
        joinedAt: '2026-01-01T00:01:00.000Z',
      });
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        socketId: 's2',
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

      connect({ ok: true, hostToken: 'tok-granted' });

      expect(result.current.isHost).toBe(true);
      expect(getHostToken(code)).toBe('tok-granted');
    });

    it('host를 못 받은 응답(null)은 기존 토큰을 지우지 않는다', () => {
      saveHostToken(code, 'tok-host');
      const { result } = setup('준');

      connect({ ok: true, hostToken: null });

      expect(result.current.isHost).toBe(true);
      expect(getHostToken(code)).toBe('tok-host');
    });

    it('host가 아닌 참가자는 join 응답 후에도 non-host로 남는다', () => {
      const { result } = setup('준');

      connect({ ok: true, hostToken: null });

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
      { code, nickname: '준' },
      expect.any(Function),
    );
  });

  it('자동 재연결 시 remoteParticipants가 초기화되어 stale 항목이 제거된다', () => {
    const { result } = setup('준');
    connect();
    act(() => {
      fakeSocket.trigger(MEETING_WS_EVENTS.PARTICIPANT_JOINED, {
        socketId: 's2',
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

  it('재연결 후 reconnectGen이 증가해 외부에 노출된다', () => {
    const { result } = setup('준');
    connect();
    expect(result.current.reconnectGen).toBe(0);
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(result.current.reconnectGen).toBe(1);
    act(() => {
      fakeSocket.trigger('connect');
    });
    expect(result.current.reconnectGen).toBe(2);
  });
});
