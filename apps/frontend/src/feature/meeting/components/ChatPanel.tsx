'use client';

import type { FormEvent } from 'react';

import type { UseChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';

/**
 * 회의 채팅 패널 dumb View.
 *
 * draft input + 메시지 목록만 렌더. 입력 상태/전송/메시지 누적은 모두
 * `useChatViewModel` 이 책임진다(ARCHITECTURE §4.2).
 */
export type ChatPanelProps = UseChatViewModel & {
  /** 내 닉네임. 일치하는 메시지는 카톡식으로 우측(내 메시지)에 표시한다. */
  readonly myNickname?: string | null;
};

export function ChatPanel({
  messages,
  canSend,
  draft,
  setDraft,
  submit,
  myNickname,
}: ChatPanelProps) {
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    submit();
  };
  return (
    <section aria-labelledby="chat-heading" className="flex h-full flex-col">
      <h2
        id="chat-heading"
        className="border-b border-border px-4 py-3 text-sm font-semibold text-text"
      >
        채팅
      </h2>
      <ul
        aria-label="chat-messages"
        className="m-0 flex-1 list-none space-y-3 overflow-auto p-4"
      >
        {messages.length === 0 && (
          <li className="text-sm text-muted">아직 메시지가 없습니다.</li>
        )}
        {messages.map((m, idx) => {
          const isMine = myNickname != null && m.nickname === myNickname;
          return (
            <li
              key={`${m.sentAt}-${idx}`}
              data-testid="chat-message"
              data-mine={isMine}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
            >
              {!isMine && (
                <span className="mb-0.5 text-xs text-muted">{m.nickname}</span>
              )}
              <span
                className={`inline-block max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
                  isMine ? 'bg-accent text-white' : 'bg-neutral-700 text-white'
                }`}
              >
                {m.text}
              </span>
            </li>
          );
        })}
      </ul>
      <form
        aria-label="chat-form"
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          메시지
        </label>
        <input
          id="chat-input"
          type="text"
          autoComplete="off"
          placeholder="메시지 입력…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend}
          className="field-input flex-1"
        />
        <button
          type="submit"
          disabled={!canSend || draft.trim().length === 0}
          className="btn-primary shrink-0"
        >
          보내기
        </button>
      </form>
    </section>
  );
}
