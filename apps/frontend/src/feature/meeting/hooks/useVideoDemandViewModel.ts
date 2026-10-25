'use client';

import type {
  MeetingLayoutVariant,
  ShareView,
  TileSize,
} from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import type { VideoDemand } from '@/feature/meeting/hooks/useRemoteMedia';
import type { VideoQuality } from '@/shared/stores/video-quality.store';

export type { VideoDemand };

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

export const computeVideoDemand = (_input: VideoDemandInput): VideoDemand => {
  throw new Error('not implemented');
};

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

export function useVideoDemandViewModel(_deps: VideoDemandDeps): void {
  throw new Error('not implemented');
}
