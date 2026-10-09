import { type ChatPostedBroadcast, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { act, renderHook } from '@testing-library/react';

import {
  useChatScrollViewModel,
  type UseChatScrollViewModelParams,
  useChatViewModel,
} from './useChatViewModel';

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
  it('초기 messages는 빈 배열, socket 없으면 canSend=false', () => {
    const { result } = renderHook(() => useChatViewModel(null, code));
    expect(result.current.messages).toEqual([]);
    expect(result.current.canSend).toBe(false);
  });

  it('socket이 있으면 canSend=true', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(socket as unknown as never, code));
    expect(result.current.canSend).toBe(true);
  });

  it('chatPosted broadcast를 수신해 messages에 누적한다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(socket as unknown as never, code));
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

  it('초기 draft는 빈 문자열, setDraft로 갱신된다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(socket as unknown as never, code));
    expect(result.current.draft).toBe('');
    act(() => {
      result.current.setDraft('안녕');
    });
    expect(result.current.draft).toBe('안녕');
  });

  it('submit()은 draft를 trim 해서 meeting:chat으로 emit 하고 입력을 비운다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(socket as unknown as never, code));
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

  it('draft가 빈 문자열/공백만이면 submit은 no-op', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(socket as unknown as never, code));
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

  it('socket이 null 이면 submit도 emit 하지 않는다', () => {
    const socket = new FakeSocket();
    const { result } = renderHook(() => useChatViewModel(null, code));
    act(() => {
      result.current.setDraft('test');
    });
    act(() => {
      result.current.submit();
    });
    expect(socket.emit).not.toHaveBeenCalled();
    // draft는 보존됨(전송 실패 → 사용자가 다시 시도 가능).
    expect(result.current.draft).toBe('test');
  });

  it('unmount 시 chatPosted 리스너를 해제한다', () => {
    const socket = new FakeSocket();
    const { unmount } = renderHook(() => useChatViewModel(socket as unknown as never, code));
    unmount();
    // listener 해제 후 trigger 해도 throw 안 함 + 이전 setMessages 호출 안 됨
    expect(socket.listeners.get(MEETING_WS_EVENTS.CHAT_POSTED) ?? []).toHaveLength(0);
  });

  it('arrivals는 broadcast로 받은 메시지만 세고 history 복원은 세지 않는다', () => {
    const socket = new FakeSocket();
    const history = [{ nickname: '준', text: '예전', sentAt: '2026-01-01T00:00:00.000Z' }];
    const { result } = renderHook(() =>
      useChatViewModel(socket as unknown as never, code, history),
    );
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.arrivals).toBe(0);
    act(() => {
      socket.trigger(MEETING_WS_EVENTS.CHAT_POSTED, {
        nickname: '아',
        text: '새거',
        sentAt: '2026-01-01T00:01:00.000Z',
      });
    });
    expect(result.current.arrivals).toBe(1);
  });
});

const message = (nickname: string, i: number): ChatPostedBroadcast => ({
  nickname,
  text: `메시지 ${i}`,
  sentAt: `2026-01-01T00:00:0${i}.000Z`,
});

/** happy-dom은 레이아웃이 없어 스크롤 치수가 0이다. 테스트가 치수를 직접 정한다. */
const fakeList = (metrics: { scrollHeight: number; clientHeight: number; scrollTop: number }) => {
  const el = document.createElement('ul');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: metrics.scrollTop,
  });
  return el;
};

const growList = (el: HTMLElement, scrollHeight: number): void => {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
};

describe('useChatScrollViewModel', () => {
  const setup = (initial: Partial<UseChatScrollViewModelParams> = {}) => {
    const onUnreadChange = vi.fn();
    const initialProps: UseChatScrollViewModelParams = {
      messages: [],
      arrivals: 0,
      isOpen: true,
      myNickname: '나',
      onUnreadChange,
      ...initial,
    };
    const hook = renderHook(
      (props: UseChatScrollViewModelParams) => useChatScrollViewModel(props),
      {
        initialProps,
      },
    );
    // 맨 아래(200 + 300 = 500)를 보고 있는 목록에서 시작한다.
    const list = fakeList({ scrollHeight: 500, clientHeight: 200, scrollTop: 300 });
    (hook.result.current.listRef as { current: HTMLUListElement | null }).current = list;
    let props = initialProps;
    const update = (next: Partial<UseChatScrollViewModelParams>): void => {
      props = { ...props, ...next };
      hook.rerender(props);
    };
    const receive = (nickname: string): void => {
      const messages = [...props.messages, message(nickname, props.messages.length)];
      growList(list, 500 + messages.length * 60);
      update({ messages, arrivals: props.arrivals + 1 });
    };
    const scrollUp = (): void => {
      list.scrollTop = 0;
      act(() => hook.result.current.onListScroll());
    };
    return { hook, list, onUnreadChange, update, receive, scrollUp };
  };

  it('열려 있고 맨 아래를 보는 중이면 새 메시지가 올 때 맨 아래로 스크롤한다', () => {
    const { hook, list, receive } = setup();
    receive('상대');
    expect(list.scrollTop).toBe(list.scrollHeight);
    expect(hook.result.current.hasUnread).toBe(false);
  });

  it('위로 스크롤해 보는 중이면 스크롤을 유지하고 미읽음으로 알린다', () => {
    const { hook, list, onUnreadChange, receive, scrollUp } = setup();
    scrollUp();
    receive('상대');
    expect(list.scrollTop).toBe(0);
    expect(hook.result.current.hasUnread).toBe(true);
    expect(onUnreadChange).toHaveBeenLastCalledWith(true);
  });

  it('내가 보낸 메시지는 위로 스크롤한 상태여도 맨 아래로 스크롤한다', () => {
    const { hook, list, receive, scrollUp } = setup();
    scrollUp();
    receive('나');
    expect(list.scrollTop).toBe(list.scrollHeight);
    expect(hook.result.current.hasUnread).toBe(false);
  });

  it('채팅 창이 닫혀 있으면 새 메시지는 미읽음이 된다', () => {
    const { hook, onUnreadChange, receive } = setup({ isOpen: false });
    receive('상대');
    expect(hook.result.current.hasUnread).toBe(true);
    expect(onUnreadChange).toHaveBeenLastCalledWith(true);
  });

  it('채팅 창을 열면 맨 아래로 가고 미읽음이 해제된다', () => {
    const { hook, list, onUnreadChange, receive, update } = setup({ isOpen: false });
    receive('상대');
    list.scrollTop = 0;
    update({ isOpen: true });
    expect(list.scrollTop).toBe(list.scrollHeight);
    expect(hook.result.current.hasUnread).toBe(false);
    expect(onUnreadChange).toHaveBeenLastCalledWith(false);
  });

  it('맨 아래까지 스크롤해 내려오면 미읽음이 해제된다', () => {
    const { hook, list, onUnreadChange, receive, scrollUp } = setup();
    scrollUp();
    receive('상대');
    list.scrollTop = list.scrollHeight - list.clientHeight;
    act(() => hook.result.current.onListScroll());
    expect(hook.result.current.hasUnread).toBe(false);
    expect(onUnreadChange).toHaveBeenLastCalledWith(false);
  });

  it('jumpToLatest는 맨 아래로 이동하고 미읽음을 해제한다', () => {
    const { hook, list, receive, scrollUp } = setup();
    scrollUp();
    receive('상대');
    act(() => hook.result.current.jumpToLatest());
    expect(list.scrollTop).toBe(list.scrollHeight);
    expect(hook.result.current.hasUnread).toBe(false);
  });

  it('history 복원은 새 메시지가 아니므로 미읽음을 만들지 않고, 열려 있으면 맨 아래로 맞춘다', () => {
    const { hook, list, update, scrollUp } = setup();
    scrollUp();
    growList(list, 900);
    update({ messages: [message('상대', 0), message('상대', 1)] });
    expect(hook.result.current.hasUnread).toBe(false);
    expect(list.scrollTop).toBe(900);
  });
});
