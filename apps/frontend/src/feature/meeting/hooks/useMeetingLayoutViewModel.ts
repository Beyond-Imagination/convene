'use client';

import { useCallback, useEffect, useState } from 'react';

/** Tailwind `md` 와 같은 경계. 두 곳이 어긋나면 타일 비율과 배치가 따로 논다. */
const MOBILE_MAX_WIDTH = 768;

/** 한 페이지에 보일 비디오 타일 최대 수. 모바일은 4:3 4명, 웹은 16:9 9명. */
const PAGE_SIZE = { desktop: 9, mobile: 4 } as const;

export type MeetingLayoutVariant = keyof typeof PAGE_SIZE;

interface UseMeetingLayoutViewModel {
  /** 기본값은 웹 열림 / 모바일 닫힘. 모바일에서는 채팅이 화면을 덮기 때문이다. */
  readonly isChatOpen: boolean;
  readonly toggleChat: () => void;
  /** 비디오 그리드의 배치 규칙. 타일 비율(16:9 / 4:3)과 span 테이블을 함께 가른다. */
  readonly variant: MeetingLayoutVariant;
  /** 화면 공유 중 하단 참가자 줄을 펼쳤는지. 기본값은 웹 펼침 / 모바일 접힘. */
  readonly isStripOpen: boolean;
  readonly toggleStrip: () => void;
  /** 현재 비디오 페이지(0-based). */
  readonly page: number;
  /** 전체 페이지 수(최소 1). */
  readonly pageCount: number;
  /** 페이지당 타일 수. */
  readonly pageSize: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly nextPage: () => void;
  readonly prevPage: () => void;
}

/**
 * 회의 페이지의 순수 프레젠테이션 상태를 책임진다.
 *  - 채팅 패널 열림/닫힘
 *  - 뷰포트에 따른 배치 variant
 *  - 화면 공유 중 참가자 줄 노출
 *  - 비디오 타일 페이지네이션(Zoom 갤러리식) — totalTiles를 받아 페이지 수를 계산
 */
export function useMeetingLayoutViewModel(totalTiles = 0): UseMeetingLayoutViewModel {
  const [page, setPage] = useState(0);
  const [variant, setVariant] = useState<MeetingLayoutVariant>('desktop');
  // null이면 variant 기본값을 따른다. 사용자가 한 번 누르면 그 선택이 유지된다.
  const [chatOverride, setChatOverride] = useState<boolean | null>(null);
  const [stripOverride, setStripOverride] = useState<boolean | null>(null);

  // 뷰포트 너비 변화에 따라 배치를 갱신한다(정적 export 안전 — effect 안에서만 window 접근).
  useEffect(() => {
    const update = (): void =>
      setVariant(window.innerWidth < MOBILE_MAX_WIDTH ? 'mobile' : 'desktop');
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const pageSize = PAGE_SIZE[variant];
  const pageCount = Math.max(1, Math.ceil(totalTiles / pageSize));

  // 참가자가 줄어 현재 page가 범위를 벗어나면 마지막 페이지로 보정한다.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const nextPage = useCallback(() => setPage((p) => Math.min(p + 1, pageCount - 1)), [pageCount]);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);

  const isChatOpen = chatOverride ?? variant === 'desktop';
  const toggleChat = useCallback(() => setChatOverride(!isChatOpen), [isChatOpen]);
  const isStripOpen = stripOverride ?? variant === 'desktop';
  const toggleStrip = useCallback(() => setStripOverride(!isStripOpen), [isStripOpen]);

  // state 보정(effect)은 한 박자 늦으므로 반환값은 항상 즉시 clamp 한 값을 쓴다.
  const safePage = Math.min(page, pageCount - 1);

  return {
    isChatOpen,
    toggleChat,
    variant,
    isStripOpen,
    toggleStrip,
    page: safePage,
    pageCount,
    pageSize,
    canPrev: safePage > 0,
    canNext: safePage < pageCount - 1,
    nextPage,
    prevPage,
  };
}
