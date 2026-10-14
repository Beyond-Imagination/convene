'use client';

import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

/** Tailwind `md` 와 같은 경계. 두 곳이 어긋나면 타일 비율과 배치가 따로 논다. */
const MOBILE_MAX_WIDTH = 768;

/**
 * 비디오 타일 배치 규칙. maxTiles 는 한 페이지 상한이고, 영역이 좁아 minWidth 를
 * 못 지키면 그보다 적게 담는다. strip* 은 화면 공유 중 하단 참가자 줄의 타일.
 */
const TILE = {
  desktop: { maxTiles: 9, aspect: 16 / 9, minWidth: 160, gap: 14, stripWidth: 236 },
  mobile: { maxTiles: 4, aspect: 4 / 3, minWidth: 120, gap: 8, stripWidth: 120 },
} as const;

const STRIP_ASPECT = 16 / 9;

/** 참가자 줄 양 끝 ‹ › 버튼 폭. VideoStage 의 버튼 크기와 같아야 한다. */
const PAGER_BUTTON_PX = 36;

export type MeetingLayoutVariant = keyof typeof TILE;

export interface TileSize {
  readonly width: number;
  readonly height: number;
}

/** count 칸을 비율을 지키며 width×height 에 넣을 때 타일이 가장 커지는 열 수. */
export const fitGrid = (
  width: number,
  height: number,
  count: number,
  aspect: number,
  gap: number,
): { readonly cols: number; readonly tileWidth: number; readonly tileHeight: number } => {
  let best = { cols: 1, tileWidth: 0, tileHeight: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const byWidth = (width - (cols - 1) * gap) / cols;
    const byHeight = ((height - (rows - 1) * gap) / rows) * aspect;
    const tileWidth = Math.floor(Math.min(byWidth, byHeight));
    if (tileWidth > best.tileWidth) {
      best = { cols, tileWidth, tileHeight: Math.floor(tileWidth / aspect) };
    }
  }
  return best;
};

export const gridCapacity = (
  width: number,
  height: number,
  variant: MeetingLayoutVariant,
): number => {
  const { maxTiles, aspect, minWidth, gap } = TILE[variant];
  for (let n = maxTiles; n > 1; n--) {
    if (fitGrid(width, height, n, aspect, gap).tileWidth >= minWidth) return n;
  }
  return 1;
};

export const stripCapacity = (width: number, total: number): number => {
  const { maxTiles, gap, stripWidth } = TILE.desktop;
  const fit = (w: number): number =>
    Math.max(1, Math.min(maxTiles, Math.floor((w + gap) / (stripWidth + gap))));
  const all = fit(width);
  return total <= all ? all : fit(width - 2 * (PAGER_BUTTON_PX + gap));
};

export function useHorizontalSwipe(
  _onPrev: () => void,
  _onNext: () => void,
): {
  readonly onPointerDown: (e: PointerEvent) => void;
  readonly onPointerUp: (e: PointerEvent) => void;
} {
  throw new Error('not implemented');
}

export type ShareView = 'strip' | 'screen' | 'participants';

interface UseMeetingLayoutViewModel {
  /** 기본값은 웹 열림 / 모바일 닫힘. 모바일에서는 채팅이 화면을 덮기 때문이다. */
  readonly isChatOpen: boolean;
  readonly toggleChat: () => void;
  /** 채팅 패널이 알려 준다. 회의 화면은 이 불리언이 바뀔 때만 다시 그려진다. */
  readonly hasUnreadChat: boolean;
  readonly setHasUnreadChat: (hasUnread: boolean) => void;
  /** 비디오 타일의 배치 규칙(비율·상한·최소 폭)을 가른다. */
  readonly variant: MeetingLayoutVariant;
  /** 화면 공유 중 하단 참가자 줄을 펼쳤는지. 기본값은 웹 펼침 / 모바일 접힘. */
  readonly isStripOpen: boolean;
  readonly toggleStrip: () => void;
  /** 현재 비디오 페이지(0-based). */
  readonly page: number;
  /** 전체 페이지 수(최소 1). */
  readonly pageCount: number;
  /** 페이지당 타일 수. 측정한 영역에 스크롤 없이 들어가는 만큼이다. */
  readonly pageSize: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly nextPage: () => void;
  readonly prevPage: () => void;
  /** 타일 영역(그리드 / 참가자 줄)에 붙인다. 이 크기로 pageSize·tileSize 를 정한다. */
  readonly tileAreaRef: (el: HTMLElement | null) => void;
  /** 측정 전이면 null. */
  readonly tileSize: TileSize | null;
  readonly tileGap: number;
  readonly shareView: ShareView;
}

/**
 * 회의 페이지의 순수 프레젠테이션 상태를 책임진다.
 *  - 채팅 패널 열림/닫힘
 *  - 뷰포트에 따른 배치 variant
 *  - 화면 공유 중 참가자 줄 노출
 *  - 비디오 타일 페이지네이션(Zoom 갤러리식) — 측정한 영역에 들어가는 만큼씩 끊는다
 */
export function useMeetingLayoutViewModel(
  totalTiles = 0,
  isSharing = false,
): UseMeetingLayoutViewModel {
  const [page, setPage] = useState(0);
  const [variant, setVariant] = useState<MeetingLayoutVariant>('desktop');
  // null이면 variant 기본값을 따른다. 사용자가 한 번 누르면 그 선택이 유지된다.
  const [chatOverride, setChatOverride] = useState<boolean | null>(null);
  const [stripOverride, setStripOverride] = useState<boolean | null>(null);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [area, setArea] = useState<TileSize | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // 뷰포트 너비 변화에 따라 배치를 갱신한다(정적 export 안전 — effect 안에서만 window 접근).
  useEffect(() => {
    const update = (): void =>
      setVariant(window.innerWidth < MOBILE_MAX_WIDTH ? 'mobile' : 'desktop');
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const tileAreaRef = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (el === null) return;
    const measure = (): void => {
      const { width, height } = el.getBoundingClientRect();
      // 접힌 참가자 줄은 0으로 잡힌다. 다시 펼칠 때 쓰도록 직전 값을 둔다.
      if (width === 0 || height === 0) return;
      setArea((prev) =>
        prev?.width === width && prev.height === height ? prev : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(el);
  }, []);

  const spec = TILE[variant];
  const pageSize =
    area === null
      ? spec.maxTiles
      : isSharing
        ? stripCapacity(area.width, totalTiles)
        : gridCapacity(area.width, area.height, variant);
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

  // 마지막 페이지는 덜 차므로 그 수로 다시 맞춰 크게 보여 준다.
  const visibleCount = Math.max(1, Math.min(pageSize, totalTiles - safePage * pageSize));
  let tileSize: TileSize | null = null;
  if (isSharing) {
    tileSize = { width: spec.stripWidth, height: Math.round(spec.stripWidth / STRIP_ASPECT) };
  } else if (area !== null) {
    const fit = fitGrid(area.width, area.height, visibleCount, spec.aspect, spec.gap);
    tileSize = { width: fit.tileWidth, height: fit.tileHeight };
  }

  return {
    isChatOpen,
    toggleChat,
    hasUnreadChat,
    setHasUnreadChat,
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
    tileAreaRef,
    tileSize,
    tileGap: spec.gap,
    shareView: 'strip',
  };
}
