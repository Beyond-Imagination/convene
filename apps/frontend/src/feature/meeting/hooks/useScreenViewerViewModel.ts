'use client';

import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Zoom 의 보기 옵션과 같은 단계. 숫자는 공유 화면 원본 해상도 대비 배율이다.
 * fit 은 전부 보이게(빈 띠 생김), fill 은 빈 띠 없이 채운다(가장자리는 잘려 드래그로 본다).
 */
export const SCREEN_SCALES = ['fit', 'fill', 0.5, 1, 1.5, 2, 3] as const;

export type ScreenScale = (typeof SCREEN_SCALES)[number];

type PanPointer = Pick<
  PointerEvent<HTMLElement>,
  'pointerId' | 'clientX' | 'clientY' | 'currentTarget'
>;

interface Sizes {
  readonly stageW: number;
  readonly stageH: number;
  readonly srcW: number;
  readonly srcH: number;
}

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly fromX: number;
  readonly fromY: number;
}

/** 버튼이 오가는 단계(원본 대비). */
const STEPS = SCREEN_SCALES.filter((s): s is Exclude<ScreenScale, 'fit' | 'fill'> => typeof s === 'number');
const MIN_PX = STEPS[0];
const MAX_PX = STEPS[STEPS.length - 1];
/** 휠 deltaY 1당 배율 변화(지수). 트랙패드처럼 잘게 오는 이벤트도 매끄럽게 쌓인다. */
const WHEEL_SENSITIVITY = 0.002;
/** 부동소수 오차로 같은 단계를 "더 크다"고 보지 않게 하는 여유. */
const EPSILON = 1e-6;

type ViewScale = ScreenScale | number;

interface View {
  readonly scale: ViewScale;
  readonly x: number;
  readonly y: number;
}

const NO_SIZES: Sizes = { stageW: 0, stageH: 0, srcW: 0, srcH: 0 };
const FIT_VIEW: View = { scale: 'fit', x: 0, y: 0 };

const isMeasured = (s: Sizes): boolean => s.srcW > 0 && s.srcH > 0 && s.stageW > 0 && s.stageH > 0;

/** 원본 대비 배율. 크기를 모르면 null. */
const pxOf = (scale: ViewScale, s: Sizes): number | null => {
  if (!isMeasured(s)) return null;
  if (scale === 'fit') return Math.min(s.stageW / s.srcW, s.stageH / s.srcH);
  if (scale === 'fill') return Math.max(s.stageW / s.srcW, s.stageH / s.srcH);
  return scale;
};

/** `<video>` 는 stage 를 object-contain 으로 채운다 — 그 맞춤 크기를 1 로 둔 transform 배율과 이동 한계. */
const layoutFor = (scale: ViewScale, s: Sizes) => {
  const px = pxOf(scale, s);
  const fit = pxOf('fit', s);
  if (px === null || fit === null) return { zoom: 1, maxX: 0, maxY: 0 };
  return {
    zoom: px / fit,
    maxX: Math.max(0, (s.srcW * px - s.stageW) / 2),
    maxY: Math.max(0, (s.srcH * px - s.stageH) / 2),
  };
};

const clamp = (v: number, max: number): number => Math.min(max, Math.max(-max, v));

/** 축소 하한은 원본 최소 단계와 맞춤 중 작은 쪽. */
const minPxOf = (s: Sizes): number => Math.min(MIN_PX, pxOf('fit', s) ?? MIN_PX);

/**
 * 배율을 바꾸되 stage 중심 기준 (cx, cy) 지점이 화면에서 제자리에 남도록 이동량을 보정한다.
 * transform 은 `translate(x, y) scale(zoom)`, 원점은 중심.
 */
const zoomTo = (v: View, nextPx: number, s: Sizes, cx = 0, cy = 0): View => {
  const px = pxOf(v.scale, s);
  if (px === null) return v;
  const target = Math.min(MAX_PX, Math.max(minPxOf(s), nextPx));
  const { maxX, maxY } = layoutFor(v.scale, s);
  const ratio = target / px;
  return {
    scale: target,
    x: cx - (cx - clamp(v.x, maxX)) * ratio,
    y: cy - (cy - clamp(v.y, maxY)) * ratio,
  };
};

const measure = (stage: HTMLDivElement | null): Sizes => {
  if (stage === null) return NO_SIZES;
  const rect = stage.getBoundingClientRect();
  const video = stage.querySelector('video');
  return {
    stageW: rect.width,
    stageH: rect.height,
    srcW: video?.videoWidth ?? 0,
    srcH: video?.videoHeight ?? 0,
  };
};

export interface UseScreenViewerViewModel {
  /** 전체화면·배율 기준이 되는 화면 공유 stage. 안의 `<video>` 원본 해상도를 읽는다. */
  readonly stageRef: RefObject<HTMLDivElement>;
  /** 요소 전체화면을 지원하지 않는 브라우저(iPhone Safari 등)면 false. */
  readonly canFullscreen: boolean;
  readonly isFullscreen: boolean;
  readonly toggleFullscreen: () => void;
  /** 메뉴 단계 또는 버튼·휠로 맞춘 임의 배율(원본 대비). */
  readonly scale: ScreenScale | number;
  readonly setScale: (scale: ScreenScale) => void;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  /** 메뉴의 숫자 단계를 한 칸씩 오간다. 휠은 stage 에 직접 붙는다(핀치의 페이지 확대를 막으려고). */
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly isMenuOpen: boolean;
  readonly toggleMenu: () => void;
  readonly closeMenu: () => void;
  /** 맞춤 크기 대비 실제 배율 — video transform 에 그대로 쓴다. */
  readonly zoom: number;
  /** 화면 픽셀 단위 이동량. 원본 화면 가장자리를 넘지 않는다. */
  readonly panX: number;
  readonly panY: number;
  /** 화면이 stage 보다 커서 끌어 옮길 수 있는지. */
  readonly canPan: boolean;
  readonly isPanning: boolean;
  readonly onPointerDown: (e: PanPointer) => void;
  readonly onPointerMove: (e: PanPointer) => void;
  readonly onPointerUp: (e: PanPointer) => void;
}

/**
 * 화면 공유 보기 — Zoom 식 배율 선택·이동과 전체화면.
 * 공유가 끝나 stage 가 사라지면 이 상태도 함께 버려진다.
 */
export function useScreenViewerViewModel(): UseScreenViewerViewModel {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // 이동량은 창·해상도가 바뀌어 한계가 줄면 읽을 때 다시 자른다.
  const [view, setView] = useState<View>(FIT_VIEW);
  const [sizes, setSizes] = useState<Sizes>(NO_SIZES);
  const [isPanning, setIsPanning] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /** 이벤트 시점의 크기를 재서 state 에 반영하고, 같은 값을 바로 계산에 쓴다. */
  const remeasure = useCallback((): Sizes => {
    const next = measure(stageRef.current);
    setSizes(next);
    return next;
  }, []);

  // 정적 export 안전 — document 접근은 effect 안에서만.
  useEffect(() => {
    const stage = stageRef.current;
    setCanFullscreen(document.fullscreenEnabled === true);
    const onResize = (): void => {
      remeasure();
    };
    const onFullscreenChange = (): void => {
      setIsFullscreen(stage !== null && document.fullscreenElement === stage);
      remeasure();
    };
    // React 의 onWheel 은 passive 라 preventDefault 가 안 먹는다 — 핀치(ctrl+휠)가 페이지를 확대하지 않게 직접 붙인다.
    const onWheel = (e: WheelEvent): void => {
      if (stage === null) return;
      const s = remeasure();
      if (!isMeasured(s)) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY);
      setView((v) => zoomTo(v, (pxOf(v.scale, s) ?? 1) * factor, s, cx, cy));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onResize);
    stage?.addEventListener('wheel', onWheel, { passive: false });
    // 미디어 이벤트는 버블링하지 않으므로 캡처 단계에서 안쪽 <video> 의 해상도 변화를 받는다.
    stage?.addEventListener('loadedmetadata', onResize, true);
    stage?.addEventListener('resize', onResize, true);
    remeasure();
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onResize);
      stage?.removeEventListener('wheel', onWheel);
      stage?.removeEventListener('loadedmetadata', onResize, true);
      stage?.removeEventListener('resize', onResize, true);
    };
  }, [remeasure]);

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (el === null) return;
    // 사용자가 거부하거나 권한이 없으면 조용히 원래 화면에 남는다.
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen().catch(() => {});
    }
  }, []);

  const setScale = useCallback(
    (next: ScreenScale) => {
      remeasure();
      setView({ scale: next, x: 0, y: 0 });
      setIsMenuOpen(false);
    },
    [remeasure],
  );
  const toggleMenu = useCallback(() => setIsMenuOpen((open) => !open), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const zoomIn = useCallback(() => {
    const s = remeasure();
    setView((v) => {
      const px = pxOf(v.scale, s);
      if (px === null) return v;
      return zoomTo(v, STEPS.find((p) => p > px + EPSILON) ?? MAX_PX, s);
    });
  }, [remeasure]);

  const zoomOut = useCallback(() => {
    const s = remeasure();
    setView((v) => {
      const px = pxOf(v.scale, s);
      if (px === null) return v;
      const lower = [...STEPS].reverse().find((p) => p < px - EPSILON);
      return zoomTo(v, lower ?? minPxOf(s), s);
    });
  }, [remeasure]);

  const { zoom, maxX, maxY } = layoutFor(view.scale, sizes);
  const panX = clamp(view.x, maxX);
  const panY = clamp(view.y, maxY);
  const canPan = maxX > 0 || maxY > 0;
  const px = pxOf(view.scale, sizes);

  const onPointerDown = useCallback(
    (e: PanPointer) => {
      if (!canPan) return;
      // 포인터가 stage 밖으로 나가도 드래그가 끊기지 않게 붙잡는다.
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        fromX: panX,
        fromY: panY,
      };
      setIsPanning(true);
    },
    [canPan, panX, panY],
  );

  const onPointerMove = useCallback(
    (e: PanPointer) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== e.pointerId) return;
      setView((v) => ({
        scale: v.scale,
        x: clamp(drag.fromX + e.clientX - drag.startX, maxX),
        y: clamp(drag.fromY + e.clientY - drag.startY, maxY),
      }));
    },
    [maxX, maxY],
  );

  const onPointerUp = useCallback((e: PanPointer) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  return {
    stageRef,
    canFullscreen,
    isFullscreen,
    toggleFullscreen,
    scale: view.scale,
    setScale,
    canZoomIn: px !== null && px < MAX_PX - EPSILON,
    canZoomOut: px !== null && px > minPxOf(sizes) + EPSILON,
    zoomIn,
    zoomOut,
    isMenuOpen,
    toggleMenu,
    closeMenu,
    zoom,
    panX,
    panY,
    canPan,
    isPanning,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
