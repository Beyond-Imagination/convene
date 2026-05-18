'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type ChatPostedBroadcast,
  MEETING_WS_EVENTS,
} from '@migration/shared-interfaces';

/**
 * 회의 채팅 ViewModel.
 *
 * `useMeetingViewModel` 이 만든 socket 인스턴스를 받아 같은 회의 room 으로
 * `meeting:chat` emit 과 `meeting:chatPosted` broadcast 수신을 처리한다.
 * socket 이 null(아직 mount 전 / redirect 상태) 일 때는 no-op.
 *
 * 채팅 메시지 형식은 wire format(`ChatPostedBroadcast`) 그대로 보관한다.
 */
export type ChatMessageView = ChatPostedBroadcast;

export interface UseChatViewModel {
  readonly messages: ReadonlyArray<ChatMessageView>;
  readonly canSend: boolean;
  readonly send: (text: string) => void;
}

export function useChatViewModel(socket: Socket | null, code: string): UseChatViewModel {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);

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

  const send = useCallback(
    (text: string) => {
      if (socket === null) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      socket.emit(MEETING_WS_EVENTS.CHAT, { code, text: trimmed });
    },
    [socket, code],
  );

  return { messages, canSend: socket !== null, send };
}
