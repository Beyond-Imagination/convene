'use client';

import type { PointerEvent, RefObject } from 'react';

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

/** 화면 공유 보기 — Zoom 식 배율 선택·이동과 전체화면. */
export function useScreenViewerViewModel(): UseScreenViewerViewModel {
  throw new Error('not implemented');
}
