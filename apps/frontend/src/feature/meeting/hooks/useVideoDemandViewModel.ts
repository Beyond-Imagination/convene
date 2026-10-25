'use client';

import { useEffect, useRef } from 'react';

import type {
  MeetingLayoutVariant,
  ShareView,
  TileSize,
} from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import type { VideoDemand } from '@/feature/meeting/hooks/useRemoteMedia';
import { useVideoQualityStore, type VideoQuality } from '@/shared/stores/video-quality.store';

export type { VideoDemand };

/** 카메라 simulcast 레이어의 높이(720p 송출 기준, useLocalMedia 의 인코딩과 맞춘다). */
const CAMERA_LAYER_HEIGHTS = [180, 360, 720] as const;
const CAMERA_TOP_LAYER = CAMERA_LAYER_HEIGHTS.length - 1;
/** 공유 화면은 절반 해상도 / 원본 두 레이어다. */
const SCREEN_TOP_LAYER = 1;
/** 타일을 아직 못 쟀을 때. */
const CAMERA_DEFAULT_LAYER = 1;
/** 이보다 촘촘한 화면은 화소를 더 받아도 눈에 띄지 않는다. */
const MAX_PIXEL_RATIO = 2;

export interface VideoDemandInput {
  /** 화면 순서대로(내 타일 제외). */
  readonly participantIds: ReadonlyArray<string>;
  readonly page: number;
  readonly pageSize: number;
  readonly tileHeight: number | null;
  readonly variant: MeetingLayoutVariant;
  readonly shareView: ShareView;
  readonly isStripOpen: boolean;
  /** 나든 다른 참가자든 화면 공유 중인지. */
  readonly isSharing: boolean;
  readonly isRemoteSharingScreen: boolean;
  readonly quality: VideoQuality;
  readonly pixelRatio: number;
}

const cameraLayerFor = (input: VideoDemandInput): number => {
  if (input.quality === 'saver') return 0;
  if (input.quality === 'high') return CAMERA_TOP_LAYER;
  if (input.tileHeight === null) return CAMERA_DEFAULT_LAYER;
  const needed = input.tileHeight * Math.min(input.pixelRatio, MAX_PIXEL_RATIO);
  const layer = CAMERA_LAYER_HEIGHTS.findIndex((h) => h >= needed);
  return layer === -1 ? CAMERA_TOP_LAYER : layer;
};

const screenLayerFor = (input: VideoDemandInput): number => {
  if (input.quality === 'saver') return 0;
  if (input.quality === 'high') return SCREEN_TOP_LAYER;
  return input.variant === 'mobile' ? 0 : SCREEN_TOP_LAYER;
};

/** VideoStage 가 그리는 것과 같은 규칙으로, 지금 화면에 보이는 영상만 고른다. */
export const computeVideoDemand = (input: VideoDemandInput): VideoDemand => {
  const tilesShown =
    !input.isSharing ||
    input.shareView === 'participants' ||
    (input.shareView === 'strip' && input.isStripOpen);
  const cameras = new Map<string, number>();
  if (tilesShown) {
    // 타일 0 은 내 타일이라 원격 i 는 타일 i+1 이다.
    const first = input.page * input.pageSize;
    const layer = cameraLayerFor(input);
    input.participantIds.forEach((id, i) => {
      if (i + 1 >= first && i + 1 < first + input.pageSize) cameras.set(id, layer);
    });
  }
  const screenShown = input.isRemoteSharingScreen && input.shareView !== 'participants';
  return { cameras, screenLayer: screenShown ? screenLayerFor(input) : null };
};

const demandKey = (d: VideoDemand): string =>
  `${[...d.cameras].map(([id, l]) => `${id}:${l}`).join(',')}|${d.screenLayer ?? '-'}`;

export interface VideoDemandDeps {
  readonly participants: ReadonlyArray<{ readonly participantId: string }>;
  readonly layout: {
    readonly page: number;
    readonly pageSize: number;
    readonly tileSize: TileSize | null;
    readonly variant: MeetingLayoutVariant;
    readonly shareView: ShareView;
    readonly isStripOpen: boolean;
  };
  readonly isSharing: boolean;
  readonly isRemoteSharingScreen: boolean;
  readonly setVideoDemand: (demand: VideoDemand) => void;
}

/**
 * 화면 배치(페이지·공유 보기)와 화질 설정으로 받을 영상을 정해 mediasoup 에 넘긴다.
 * 안 보이는 영상을 받지 않는 것이 모바일 데이터 사용량을 가장 크게 줄인다.
 */
export function useVideoDemandViewModel({
  participants,
  layout,
  isSharing,
  isRemoteSharingScreen,
  setVideoDemand,
}: VideoDemandDeps): void {
  const quality = useVideoQualityStore((s) => s.quality);
  const hydrate = useVideoQualityStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const demand = computeVideoDemand({
    participantIds: participants.map((p) => p.participantId),
    page: layout.page,
    pageSize: layout.pageSize,
    tileHeight: layout.tileSize?.height ?? null,
    variant: layout.variant,
    shareView: layout.shareView,
    isStripOpen: layout.isStripOpen,
    isSharing,
    isRemoteSharingScreen,
    quality,
    pixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  });
  // 매 렌더 새 Map 이 나오므로 내용이 바뀔 때만 넘긴다.
  const latest = useRef(demand);
  latest.current = demand;
  const key = demandKey(demand);

  useEffect(() => {
    setVideoDemand(latest.current);
  }, [key, setVideoDemand]);
}
