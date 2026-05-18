'use client';

import type { FormEvent } from 'react';

import type { UseChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';

/**
 * 회의 채팅 패널 dumb View.
 *
 * draft input + 메시지 목록만 렌더. 입력 상태/전송/메시지 누적은 모두
 * `useChatViewModel` 이 책임진다(ARCHITECTURE §4.2).
 */
export type ChatPanelProps = UseChatViewModel;

export function ChatPanel({
  messages,
  canSend,
  draft,
  setDraft,
  submit,
}: ChatPanelProps) {
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    submit();
  };
  return (
    <section aria-labelledby="chat-heading">
      <h2 id="chat-heading">채팅</h2>
      <ul aria-label="chat-messages">
        {messages.map((m, idx) => (
          <li key={`${m.sentAt}-${idx}`} data-testid="chat-message">
            <strong>{m.nickname}</strong>: {m.text}
          </li>
        ))}
      </ul>
      <form aria-label="chat-form" onSubmit={onSubmit}>
        <label>
          메시지
          <input
            type="text"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canSend}
          />
        </label>
        <button type="submit" disabled={!canSend || draft.trim().length === 0}>
          보내기
        </button>
      </form>
    </section>
  );
}
