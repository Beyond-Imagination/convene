'use client';

export type MeetingGuideTarget =
  | 'media'
  | 'screen-share'
  | 'reaction'
  | 'chat'
  | 'pages'
  | 'help'
  | 'leave';

export interface MeetingGuideStep {
  readonly id: MeetingGuideTarget;
  readonly title: string;
  readonly body: string;
  readonly whenMissing?: string;
}

export const MEETING_GUIDE_STEPS: ReadonlyArray<MeetingGuideStep> = [];

export interface GuideRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface UseMeetingGuideViewModel {
  readonly isActive: boolean;
  readonly step: MeetingGuideStep | null;
  readonly index: number;
  readonly total: number;
  readonly rect: GuideRect | null;
  readonly next: () => void;
  readonly prev: () => void;
  readonly skip: () => void;
}

export function useMeetingGuideViewModel(_options: {
  readonly ready: boolean;
  readonly blocked: boolean;
}): UseMeetingGuideViewModel {
  throw new Error('not implemented');
}
