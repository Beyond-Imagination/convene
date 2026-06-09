'use client';

import { type ChatPostedBroadcast, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type ChatMessageView = ChatPostedBroadcast;

export interface UseChatViewModel {
  readonly messages: ReadonlyArray<ChatMessageView>;
  readonly canSend: boolean;
  /** 입력 상태도 ViewModel이 보유 — View는 dumb 유지. */
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  /** draft를 trim 해서 emit 하고 입력을 비운다. canSend=false 또는 공백이면 no-op. */
  readonly submit: () => void;
}

/**
 * 회의 채팅 ViewModel.
 * `useMeetingViewModel`이 만든 socket 인스턴스를 받아 같은 회의 room으로 `meeting:chat` emit과 `meeting:chatPosted` broadcast 수신을 처리한다.
 * socket이 null(아직 mount 전 / redirect 상태) 일 때는 no-op.
 * 채팅 메시지 형식은 wire format 그대로 보관한다.
 */
export function useChatViewModel(socket: Socket | null, code: string): UseChatViewModel {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (socket === null) return undefined;
    const onChatPosted = (payload: ChatPostedBroadcast): void => {
      setMessages((prev) => [...prev, payload]);
    };
    socket.on(MEETING_WS_EVENTS.CHAT_POSTED, onChatPosted);
    return () => {
      socket.off(MEETING_WS_EVENTS.CHAT_POSTED, onChatPosted);
    };
  }, [socket]);

  const submit = useCallback(() => {
    if (socket === null) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    socket.emit(MEETING_WS_EVENTS.CHAT, { code, text: trimmed });
    setDraft('');
  }, [socket, code, draft]);

  return { messages, canSend: socket !== null, draft, setDraft, submit };
}
