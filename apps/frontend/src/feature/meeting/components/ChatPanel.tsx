'use client';

import type { FormEvent } from 'react';

import type { UseChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';

/**
 * 회의 채팅 패널 dumb View.
 * draft input + 메시지 목록만 렌더.
 */
export type ChatPanelProps = UseChatViewModel & {
  /** 내 닉네임. 일치하는 메시지는 카톡식으로 우측(내 메시지)에 표시한다. */
  readonly myNickname?: string | null;
  /** 모바일에서 패널이 화면을 덮으므로 닫는 길을 헤더에 둔다. */
  readonly onClose?: () => void;
};

export function ChatPanel({
  messages,
  canSend,
  draft,
  setDraft,
  submit,
  myNickname,
  onClose,
}: ChatPanelProps) {
  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    submit();
  };
  return (
    <section
      aria-labelledby="chat-heading"
      className="flex h-full flex-col px-4 md:px-0"
    >
      <div className="border-border flex items-center justify-between border-b py-3.5 md:pb-4">
        <h2
          id="chat-heading"
          className="cap md:tracking-[0.12em]"
        >
          채팅
        </h2>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted text-xs font-semibold md:hidden"
          >
            닫기
          </button>
        )}
      </div>

      <ul
        aria-label="chat-messages"
        className="m-0 flex flex-1 list-none flex-col gap-4 overflow-auto py-5"
      >
        {messages.length === 0 && <li className="text-muted text-sm">아직 메시지가 없습니다.</li>}
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
                <span className="text-muted text-meta mb-1.5 font-semibold">{m.nickname}</span>
              )}
              <span
                className={`text-body inline-block max-w-[86%] break-words px-4 py-3 ${
                  isMine
                    ? 'bg-accent text-accent-fg rounded-[16px_16px_5px_16px]'
                    : 'bg-surface text-text rounded-[16px_16px_16px_5px]'
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
        className="border-border flex items-center gap-3.5 border-t pb-4 pt-4"
      >
        <label
          htmlFor="chat-input"
          className="sr-only"
        >
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
          className="field-input flex-1 py-2"
        />
        <button
          type="submit"
          disabled={!canSend || draft.trim().length === 0}
          className="text-accent-on text-action shrink-0 font-bold transition-opacity disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </section>
  );
}
