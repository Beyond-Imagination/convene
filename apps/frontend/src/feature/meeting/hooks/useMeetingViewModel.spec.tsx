import { act, renderHook, waitFor } from '@testing-library/react';

import { MEETING_WS_EVENTS } from '@migration/shared-interfaces';

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

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('@/shared/socket/meeting.socket', () => ({
  connectMeetingSocket: () => fakeSocket,
}));

const code = 'abc12xyz';

const setup = (nickname: string | null = '준') => {
  useSessionStore.setState({ nickname });
  fakeSocket = new FakeSocket();
  pushMock.mockReset();
  replaceMock.mockReset();
  return renderHook(() => useMeetingViewModel(code));
};

const connect = (): void => {
  act(() => {
    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
  });
};

describe('useMeetingViewModel', () => {
  it('닉네임이 store에 없으면 / 로 redirect 한다', () => {
    setup(null);
    expect(replaceMock).toHaveBeenCalledWith('/');
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
