'use client';

import type { CSSProperties } from 'react';

import type {
  GuideRect,
  UseMeetingGuideViewModel,
} from '@/feature/meeting/hooks/useMeetingGuideViewModel';

export type MeetingGuideProps = UseMeetingGuideViewModel;

/** 밝힌 영역을 버튼보다 조금 넓게 잡는다. */
const SPOT_PAD = 6;
const CARD_GAP = 14;
const CARD_WIDTH = 320;

/** 대상이 화면 위쪽이면 아래에, 아래쪽이면 위에 말풍선을 둔다. 좌우는 화면 밖으로 나가지 않게 잡는다. */
const cardPosition = (rect: GuideRect | null): CSSProperties => {
  if (rect === null) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  const centerX = rect.left + rect.width / 2;
  const left = `clamp(16px, ${centerX - CARD_WIDTH / 2}px, calc(100% - ${CARD_WIDTH + 16}px))`;
  const isUpperHalf = rect.top + rect.height / 2 < window.innerHeight / 2;
  return isUpperHalf
    ? { left, top: rect.top + rect.height + SPOT_PAD + CARD_GAP }
    : { left, bottom: `calc(100% - ${rect.top - SPOT_PAD - CARD_GAP}px)` };
};

/** 회의 화면 가이드 — 화면을 어둡게 하고 지금 단계의 버튼만 밝혀 설명한다. */
export function MeetingGuide({
  isActive,
  step,
  index,
  total,
  rect,
  next,
  prev,
  skip,
}: MeetingGuideProps) {
  if (!isActive || step === null) return null;
  const isLast = index >= total - 1;

  return (
    <div className="fixed inset-0 z-50">
      {rect === null ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/55"
        />
      ) : (
        // 큰 그림자로 버튼 밖을 덮어 구멍 뚫린 막처럼 보이게 한다.
        <div
          aria-hidden="true"
          className="ring-accent pointer-events-none absolute rounded-2xl ring-2 transition-all duration-200"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-guide-title"
        aria-describedby="meeting-guide-body"
        onKeyDown={(e) => {
          if (e.key === 'Escape') skip();
          if (e.key === 'ArrowRight') next();
          if (e.key === 'ArrowLeft' && index > 0) prev();
        }}
        className="border-border bg-paper absolute flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-2xl border p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
        style={cardPosition(rect)}
      >
        <div className="flex items-center justify-between">
          <span className="text-accent-on text-cap font-mono font-bold">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={skip}
            className="text-muted hover:text-text text-meta font-semibold transition-colors"
          >
            건너뛰기
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2
            id="meeting-guide-title"
            className="text-title text-text font-bold"
          >
            {step.title}
          </h2>
          <p
            id="meeting-guide-body"
            className="text-body text-muted"
          >
            {step.body}
          </p>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={prev}
              className="btn-ghost min-h-10 px-4"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={next}
            // 단계가 바뀌어도 같은 버튼이라 포커스가 남아 Enter 로 계속 넘길 수 있다.
            autoFocus
            className="btn-primary min-h-10 px-4"
          >
            {isLast ? '완료' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
