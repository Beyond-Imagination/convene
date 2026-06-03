import { MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';

import { saveHostToken } from '@/shared/stores/host-token.storage';
import { useSessionStore } from '@/shared/stores/session.store';

import { useMeetingViewModel } from './useMeetingViewModel';

/**
 * Socket.IO 클라이언트의 최소 인터페이스만 흉내내는 fake.
 * 테스트가 직접 `trigger(event, payload)` 를 호출해 서버 측 broadcast 를 모사한다.
 */
class FakeSocket {
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  connected = false;
  readonly emit = vi.fn();
  readonly disconnect = vi.fn(() => {
    this.connected = false;
  });

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

const connect = (): void => {
  act(() => {
    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
  });
};

describe('useMeetingViewModel', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('닉네임이 store 에 없으면 홈으로 redirect 하지 않고 socket 도 만들지 않는다 (직접 접속 닉네임 모달용)', () => {
    const { result } = setup(null);
    // 링크 직접 접속(미인증)은 홈으로 튕기지 않고 회의 페이지에서 닉네임 입력을 받는다.
    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current.socket).toBeNull();
  });

  it('mount + connect 시 meeting:join 을 emit 한다', () => {
    const { result } = setup('준');
    connect();
    expect(fakeSocket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.JOIN, {
      code,
      nickname: '준',
    });
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

  it('같은 socketId 가 다시 join 되면 중복되지 않고 갱신된다', () => {
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

  it('닉네임 없으면(redirect) socket 은 null 로 유지된다', () => {
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
    it('회의 code 에 대한 hostToken 이 저장돼 있으면 isHost=true', () => {
      saveHostToken(code, 'tok-host');
      const { result } = setup('준');
      expect(result.current.isHost).toBe(true);
    });

    it('hostToken 이 없으면 isHost=false(회의 입장자/비-host)', () => {
      const { result } = setup('준');
      expect(result.current.isHost).toBe(false);
    });
  });

  describe('endMeeting()', () => {
    it('DELETE /meetings/:code 를 호출하고 성공 시 닉네임 clear + /reports 로 push', async () => {
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
      // hostToken 저장이 없으면 undefined 로 호출(backend 가 host 아님으로 거부).
      expect(closeMeetingMock).toHaveBeenCalledWith(code, undefined);
      expect(useSessionStore.getState().nickname).toBeNull();
      expect(pushMock).toHaveBeenCalledWith('/reports');
      // 닉네임이 비워져도 미인증 홈 redirect 와 경쟁하지 않는다("(미인증)" 깜박임 방지).
      expect(replaceMock).not.toHaveBeenCalledWith('/');
    });

    it('저장된 hostToken 을 closeMeeting 에 함께 전달한다', async () => {
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

    it('성공 시 leave 처럼 socket 도 disconnect 한다(중복 leave 이벤트 차단)', async () => {
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

    it('DELETE 가 실패해도 사용자 경험을 깨지 않고 /reports 로 이동한다', async () => {
      closeMeetingMock.mockRejectedValueOnce(new Error('Meeting is already closed'));
      const { result } = setup('준');
      connect();
      await act(async () => {
        await result.current.endMeeting();
      });
      expect(pushMock).toHaveBeenCalledWith('/reports');
      expect(useSessionStore.getState().nickname).toBeNull();
    });

    it('성공 후 cleanup 에서 meeting:leave 를 다시 emit 하지 않는다(이미 종료된 회의 race 방지)', async () => {
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
    it('수신 시 닉네임 clear + socket.disconnect + /reports 로 push', () => {
      const { result } = setup('준');
      connect();
      act(() => {
        fakeSocket.trigger(MEETING_WS_EVENTS.ENDED, {
          code,
          endedAt: '2026-01-01T00:30:00.000Z',
        });
      });
      // result.current 도 함께 갱신됨을 부수적으로 확인
      void result.current;
      expect(useSessionStore.getState().nickname).toBeNull();
      expect(fakeSocket.disconnect).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith('/reports');
      // 닉네임이 비워져도 미인증 홈 redirect 와 경쟁하지 않는다("(미인증)" 깜박임 방지).
      expect(replaceMock).not.toHaveBeenCalledWith('/');
    });

    it('수신 후 cleanup 에서 meeting:leave 를 emit 하지 않는다(이미 종료됨)', () => {
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

    it('수신 시 closeMeeting API 는 호출하지 않는다(backend 가 이미 종료한 회의)', () => {
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

  it('자동 재연결 시(connect 두 번째 발생) JOIN 을 다시 emit 한다', () => {
    setup('준');
    connect(); // 첫 connect
    fakeSocket.emit.mockClear();
    act(() => {
      fakeSocket.trigger('connect'); // 재연결 시뮬
    });
    expect(fakeSocket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.JOIN, {
      code,
      nickname: '준',
    });
  });

  it('자동 재연결 시 remoteParticipants 가 초기화되어 stale 항목이 제거된다', () => {
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

  it('재연결 후 reconnectGen 이 증가해 외부에 노출된다', () => {
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
