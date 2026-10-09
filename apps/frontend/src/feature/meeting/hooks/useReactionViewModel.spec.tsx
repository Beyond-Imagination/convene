import { MEETING_WS_EVENTS, type ReactionBroadcast } from '@convene/shared-interfaces';
import { act, renderHook } from '@testing-library/react';

import {
  MAX_REACTION_BUBBLES,
  REACT_COOLDOWN_MS,
  REACTION_DISPLAY_MS,
  useReactionViewModel,
} from './useReactionViewModel';

class FakeSocket {
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly emit = vi.fn();

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

const reactionOf = (
  participantId: string,
  nickname: string,
  kind: ReactionBroadcast['kind'],
): ReactionBroadcast => ({
  participantId,
  nickname,
  kind,
  sentAt: '2026-01-01T00:00:00.000Z',
});

const setup = (selfParticipantId: string | null = 'p-me') => {
  const socket = new FakeSocket();
  const hook = renderHook(() =>
    useReactionViewModel(socket as unknown as never, code, selfParticipantId),
  );
  return { socket, ...hook };
};

describe('useReactionViewModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('socket이 없으면 리액션을 보낼 수 없고 말풍선도 없다', () => {
    const { result } = renderHook(() => useReactionViewModel(null, code, null));
    expect(result.current.canReact).toBe(false);
    expect(result.current.bubbles).toEqual([]);
  });

  it('react는 meeting:react를 emit 하고 연타할 수 있게 picker를 열어 둔다', () => {
    const { socket, result } = setup();
    act(() => {
      result.current.togglePicker();
    });
    expect(result.current.isPickerOpen).toBe(true);
    act(() => {
      result.current.react('party');
    });
    expect(socket.emit).toHaveBeenCalledWith(MEETING_WS_EVENTS.REACT, { code, kind: 'party' });
    expect(result.current.isPickerOpen).toBe(true);
  });

  it('연타는 쿨다운 동안 한 번만 보낸다', () => {
    const { socket, result } = setup();
    act(() => {
      result.current.react('clap');
      result.current.react('clap');
    });
    expect(socket.emit).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(REACT_COOLDOWN_MS);
      result.current.react('clap');
    });
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  it('수신한 리액션을 누가 보냈는지와 함께 말풍선으로 띄우고 표시 시간이 지나면 지운다', () => {
    const { socket, result } = setup();
    act(() => {
      socket.trigger(MEETING_WS_EVENTS.REACTION, reactionOf('p-2', '앨리스', 'heart'));
    });
    expect(result.current.bubbles).toEqual([
      expect.objectContaining({ kind: 'heart', nickname: '앨리스', isSelf: false }),
    ]);
    act(() => {
      vi.advanceTimersByTime(REACTION_DISPLAY_MS);
    });
    expect(result.current.bubbles).toEqual([]);
  });

  it('내 리액션은 isSelf로 표시한다', () => {
    const { socket, result } = setup('p-me');
    act(() => {
      socket.trigger(MEETING_WS_EVENTS.REACTION, reactionOf('p-me', '준', 'nod'));
    });
    expect(result.current.bubbles[0]?.isSelf).toBe(true);
  });

  it('같은 사람이 연달아 보내도 말풍선이 각각 떠오르고 각자의 시간에 사라진다', () => {
    const { socket, result } = setup();
    act(() => {
      socket.trigger(MEETING_WS_EVENTS.REACTION, reactionOf('p-2', '앨리스', 'clap'));
      vi.advanceTimersByTime(1_000);
      socket.trigger(MEETING_WS_EVENTS.REACTION, reactionOf('p-2', '앨리스', 'clap'));
    });
    const ids = result.current.bubbles.map((b) => b.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    act(() => {
      vi.advanceTimersByTime(REACTION_DISPLAY_MS - 1_000);
    });
    expect(result.current.bubbles.map((b) => b.id)).toEqual([ids[1]]);
  });

  it('한꺼번에 몰리면 상한을 넘는 새 말풍선은 버린다 — 떠오르던 것이 중간에 사라지지 않는다', () => {
    const { socket, result } = setup();
    act(() => {
      for (let i = 0; i < MAX_REACTION_BUBBLES + 5; i += 1) {
        socket.trigger(MEETING_WS_EVENTS.REACTION, reactionOf(`p-${i}`, `n${i}`, 'party'));
      }
    });
    expect(result.current.bubbles).toHaveLength(MAX_REACTION_BUBBLES);
    expect(result.current.bubbles[0]?.nickname).toBe('n0');
    expect(result.current.bubbles.at(-1)?.nickname).toBe(`n${MAX_REACTION_BUBBLES - 1}`);
  });

  it('closePicker는 picker를 닫는다', () => {
    const { result } = setup();
    act(() => {
      result.current.togglePicker();
      result.current.closePicker();
    });
    expect(result.current.isPickerOpen).toBe(false);
  });

  it('unmount 시 구독을 해제한다', () => {
    const { socket, unmount } = setup();
    unmount();
    expect(socket.listeners.get(MEETING_WS_EVENTS.REACTION)).toEqual([]);
  });
});
