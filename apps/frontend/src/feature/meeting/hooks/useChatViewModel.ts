'use client';

import { type ChatPostedBroadcast, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

/** 이만큼 위까지는 맨 아래로 본다. 소수점 스크롤 위치와 마지막 줄 여백을 흡수한다. */
const BOTTOM_TOLERANCE_PX = 24;

export type ChatMessageView = ChatPostedBroadcast;

const isAtBottom = (el: HTMLElement): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_TOLERANCE_PX;

export interface UseChatScrollViewModelParams {
  readonly messages: ReadonlyArray<ChatMessageView>;
  readonly arrivals: number;
  readonly isOpen: boolean;
  readonly myNickname: string | null;
  readonly onUnreadChange?: (hasUnread: boolean) => void;
}

export interface UseChatScrollViewModel {
  readonly listRef: RefObject<HTMLUListElement>;
  readonly onListScroll: () => void;
  readonly hasUnread: boolean;
  readonly jumpToLatest: () => void;
}

/**
 * 채팅 목록의 자동 스크롤과 미읽음.
 * 맨 아래를 보고 있을 때만 새 메시지를 따라 내려가고, 위로 올려 읽는 중이거나 창이 닫혀 있으면 미읽음으로 알린다.
 * 내 메시지는 방금 보낸 걸 확인하는 흐름이라 항상 따라간다.
 */
export function useChatScrollViewModel({
  messages,
  arrivals,
  isOpen,
  myNickname,
  onUnreadChange,
}: UseChatScrollViewModelParams): UseChatScrollViewModel {
  const listRef = useRef<HTMLUListElement>(null);
  // 새 메시지가 붙은 뒤에는 이미 맨 아래가 아니게 된다. 붙기 전 위치로 판단하려고 마지막 판정을 들고 있다.
  const atBottomRef = useRef(true);
  const seenCountRef = useRef(messages.length);
  const seenArrivalsRef = useRef(arrivals);
  const [hasUnread, setHasUnread] = useState(false);

  const jumpToLatest = useCallback(() => {
    const el = listRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setHasUnread(false);
  }, []);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (el === null) return;
    atBottomRef.current = isAtBottom(el);
    if (atBottomRef.current) setHasUnread(false);
  }, []);

  // 높이가 바뀐 직후 그리기 전에 맞춰야 한 프레임 튀지 않는다.
  useLayoutEffect(() => {
    if (messages.length === seenCountRef.current) return;
    seenCountRef.current = messages.length;
    // 재연결 히스토리 복원은 새 메시지가 아니다.
    if (arrivals === seenArrivalsRef.current) {
      if (isOpen) jumpToLatest();
      return;
    }
    seenArrivalsRef.current = arrivals;
    const last = messages[messages.length - 1];
    const isMine = last !== undefined && myNickname !== null && last.nickname === myNickname;
    if (isOpen && (atBottomRef.current || isMine)) jumpToLatest();
    else setHasUnread(true);
  }, [messages, arrivals, isOpen, myNickname, jumpToLatest]);

  useLayoutEffect(() => {
    if (isOpen) jumpToLatest();
  }, [isOpen, jumpToLatest]);

  useEffect(() => {
    onUnreadChange?.(hasUnread);
  }, [hasUnread, onUnreadChange]);

  return { listRef, onListScroll, hasUnread, jumpToLatest };
}

export interface UseChatViewModel {
  readonly messages: ReadonlyArray<ChatMessageView>;
  /** broadcast로 받은 메시지 수. 히스토리 복원과 새 메시지를 가르는 신호다. */
  readonly arrivals: number;
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
export function useChatViewModel(
  socket: Socket | null,
  code: string,
  history: ReadonlyArray<ChatPostedBroadcast> = [],
): UseChatViewModel {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [arrivals, setArrivals] = useState(0);
  const [draft, setDraft] = useState('');

  // 끊긴 동안 남이 보낸 메시지는 broadcast로 오지 않는다. 이 경로가 없으면 그 구간이 비어 버린다.
  useEffect(() => {
    if (history.length === 0) return;
    setMessages([...history]);
  }, [history]);

  useEffect(() => {
    if (socket === null) return undefined;
    const onChatPosted = (payload: ChatPostedBroadcast): void => {
      setMessages((prev) => [...prev, payload]);
      setArrivals((n) => n + 1);
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

  return { messages, arrivals, canSend: socket !== null, draft, setDraft, submit };
}
