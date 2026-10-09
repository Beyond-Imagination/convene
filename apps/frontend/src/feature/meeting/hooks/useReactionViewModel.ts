'use client';

import {
  MEETING_WS_EVENTS,
  type ReactionBroadcast,
  type ReactionKind,
} from '@convene/shared-interfaces';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

export const REACTION_DISPLAY_MS = 4_000;
export const REACT_COOLDOWN_MS = 300;
export const MAX_REACTION_BUBBLES = 20;

export interface ReactionBubble {
  /** 말풍선마다 고유하다 — 같은 사람이 연달아 보내도 각각 떠오른다. */
  readonly id: number;
  readonly kind: ReactionKind;
  readonly nickname: string;
  readonly isSelf: boolean;
}

export interface UseReactionViewModel {
  /** 오래된 것부터. */
  readonly bubbles: ReadonlyArray<ReactionBubble>;
  readonly canReact: boolean;
  readonly isPickerOpen: boolean;
  readonly togglePicker: () => void;
  readonly closePicker: () => void;
  /** picker는 연타할 수 있게 열어 둔다. 쿨다운 안의 입력은 버린다. */
  readonly react: (kind: ReactionKind) => void;
}

/**
 * 일회성 리액션(이모지)의 ViewModel. 본인 것도 서버 broadcast를 받아서 띄운다.
 * 손들기는 참가자 상태라 `useMeetingViewModel`이 맡는다.
 */
export function useReactionViewModel(
  socket: Socket | null,
  code: string,
  selfParticipantId: string | null,
): UseReactionViewModel {
  const [bubbles, setBubbles] = useState<ReadonlyArray<ReactionBubble>>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const nextIdRef = useRef(0);
  const lastSentAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (socket === null) return undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onReaction = (payload: ReactionBroadcast): void => {
      nextIdRef.current += 1;
      const bubble: ReactionBubble = {
        id: nextIdRef.current,
        kind: payload.kind,
        nickname: payload.nickname,
        isSelf: payload.participantId === selfParticipantId,
      };
      // 넘치면 새 것을 버린다. 오래된 것을 밀어내면 떠오르던 말풍선이 중간에 툭 사라진다.
      setBubbles((prev) => (prev.length >= MAX_REACTION_BUBBLES ? prev : [...prev, bubble]));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setBubbles((prev) => prev.filter((b) => b.id !== bubble.id));
      }, REACTION_DISPLAY_MS);
      timers.add(timer);
    };
    socket.on(MEETING_WS_EVENTS.REACTION, onReaction);
    return () => {
      socket.off(MEETING_WS_EVENTS.REACTION, onReaction);
      timers.forEach(clearTimeout);
    };
  }, [socket, selfParticipantId]);

  const togglePicker = useCallback(() => setIsPickerOpen((open) => !open), []);
  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  const react = useCallback(
    (kind: ReactionKind) => {
      if (socket === null) return;
      const now = Date.now();
      if (now - lastSentAtRef.current < REACT_COOLDOWN_MS) return;
      lastSentAtRef.current = now;
      socket.emit(MEETING_WS_EVENTS.REACT, { code, kind });
    },
    [socket, code],
  );

  return {
    bubbles,
    canReact: socket !== null,
    isPickerOpen,
    togglePicker,
    closePicker,
    react,
  };
}
