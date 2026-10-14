'use client';

import { type ReactNode, useId } from 'react';

const WIDTH = { md: 'max-w-md', lg: 'max-w-2xl' } as const;

/**
 * 화면을 떠나지 않고 띄우는 모달 틀 — 바깥 클릭·Escape·닫기 버튼으로 닫는다.
 * 내용이 길면 머리는 두고 본문만 스크롤한다.
 */
export function Dialog({
  title,
  closeLabel,
  onClose,
  width = 'md',
  backdropTestId,
  children,
}: {
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly width?: keyof typeof WIDTH;
  readonly backdropTestId?: string;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={backdropTestId}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        className={`border-border bg-paper relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl border shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${WIDTH[width]}`}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-2 pt-6 md:px-8 md:pt-8">
          <h2
            id={titleId}
            className="text-title text-text font-bold"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            // 열리자마자 포커스를 안으로 옮겨 Escape 와 Tab 이 모달에서 시작하게 한다.
            autoFocus
            className="text-muted hover:bg-text/10 hover:text-text grid h-9 w-9 place-items-center rounded-full text-xl transition-colors"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-4 md:px-8 md:pb-8">{children}</div>
      </div>
    </div>
  );
}
