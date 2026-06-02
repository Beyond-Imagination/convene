import { MEETING_WS_EVENTS } from '@migration/shared-interfaces';
import { act, renderHook } from '@testing-library/react';

import { useChatViewModel } from './useChatViewModel';

class FakeSocket {
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly emit = vi.fn();
  readonly disconnect = vi.fn();

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

const code = 'abc12xyz';

describe('useChatViewModel', () => {
  it('초기 messages 는 빈 배열, socket 없으면 canSend=false', () => {
    const { result } = renderHook(() => useChatViewModel(null, code));
    expect(result.current.messages).toEqual([]);
    expect(result.current.canSend).toBe(false);
  });

  it('socket 이 있으면 canSend=true', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    expect(result.current.canSend).toBe(true);
  });

  it('chatPosted broadcast 를 수신해 messages 에 누적한다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    act(() => {
      socket.trigger(MEETING_WS_EVENTS.CHAT_POSTED, {
        nickname: '준',
        text: '안녕',
        sentAt: '2026-01-01T00:01:00.000Z',
      });
      socket.trigger(MEETING_WS_EVENTS.CHAT_POSTED, {
        nickname: '아',
        text: '하이',
        sentAt: '2026-01-01T00:01:05.000Z',
      });
    });
    expect(result.current.messages).toEqual([
      { nickname: '준', text: '안녕', sentAt: '2026-01-01T00:01:00.000Z' },
      { nickname: '아', text: '하이', sentAt: '2026-01-01T00:01:05.000Z' },
    ]);
  });

  it('초기 draft 는 빈 문자열, setDraft 로 갱신된다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    expect(result.current.draft).toBe('');
    act(() => {
      result.current.setDraft('안녕');
    });
    expect(result.current.draft).toBe('안녕');
  });

  it('submit() 은 draft 를 trim 해서 meeting:chat 으로 emit 하고 입력을 비운다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    act(() => {
      result.current.setDraft('  안녕하세요  ');
    });
    act(() => {
      result.current.submit();
    });
    expect(socket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.CHAT, {
      code,
      text: '안녕하세요',
    });
    expect(result.current.draft).toBe('');
  });

  it('draft 가 빈 문자열/공백만이면 submit 은 no-op', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    act(() => {
      result.current.submit();
    });
    act(() => {
      result.current.setDraft('   ');
    });
    act(() => {
      result.current.submit();
    });
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('socket 이 null 이면 submit 도 emit 하지 않는다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(null, code));
    act(() => {
      result.current.setDraft('test');
    });
    act(() => {
      result.current.submit();
    });
    expect(socket.emit).not.toHaveBeenCalled();
    // draft 는 보존됨(전송 실패 → 사용자가 다시 시도 가능).
    expect(result.current.draft).toBe('test');
  });

  it('unmount 시 chatPosted 리스너를 해제한다', () => {
    const socket = new FakeSocket();
    const { unmount } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code),
    );
    unmount();
    // listener 해제 후 trigger 해도 throw 안 함 + 이전 setMessages 호출 안 됨
    expect(socket.listeners.get(MEETING_WS_EVENTS.CHAT_POSTED) ?? []).toHaveLength(0);
  });
});
