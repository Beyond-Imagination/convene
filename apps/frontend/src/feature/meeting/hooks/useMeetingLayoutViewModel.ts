'use client';

import { useCallback, useEffect, useState } from 'react';

/** SSR/정적 빌드 등 window 가 없을 때의 기본 페이지 크기. */
export const MEETING_VIDEO_PAGE_SIZE = 6;

/** 뷰포트 너비에 따라 한 페이지에 보일 비디오 타일 최대 수. */
const pageSizeForWidth = (width: number): number => {
  if (width < 640) return 2;
  if (width < 1024) return 4;
  if (width < 1440) return 6;
  return 9;
};

export interface UseMeetingLayoutViewModel {
  readonly isChatOpen: boolean;
  readonly toggleChat: () => void;
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
 *  - 채팅 패널 열림/닫힘(기본 열림)
 *  - 비디오 타일 페이지네이션(Zoom 갤러리식) — totalTiles 를 받아 페이지 수를 계산
 *
 * View 는 useState 를 직접 쓸 수 없으므로 여기로 분리한다.
 */
export function useMeetingLayoutViewModel(
  totalTiles = 0,
): UseMeetingLayoutViewModel {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(MEETING_VIDEO_PAGE_SIZE);
  const toggleChat = useCallback(() => setIsChatOpen((open) => !open), []);

  // 뷰포트 너비 변화에 따라 페이지당 타일 수를 갱신한다(정적 export 안전 — effect 안에서만 window 접근).
  useEffect(() => {
    const update = (): void => setPageSize(pageSizeForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const pageCount = Math.max(1, Math.ceil(totalTiles / pageSize));

  // 참가자가 줄어 현재 page 가 범위를 벗어나면 마지막 페이지로 보정한다.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const nextPage = useCallback(
    () => setPage((p) => Math.min(p + 1, pageCount - 1)),
    [pageCount],
  );
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);

  // state 보정(effect)은 한 박자 늦으므로 반환값은 항상 즉시 clamp 한 값을 쓴다.
  const safePage = Math.min(page, pageCount - 1);

  return {
    isChatOpen,
    toggleChat,
    page: safePage,
    pageCount,
    pageSize,
    canPrev: safePage > 0,
    canNext: safePage < pageCount - 1,
    nextPage,
    prevPage,
  };
}
