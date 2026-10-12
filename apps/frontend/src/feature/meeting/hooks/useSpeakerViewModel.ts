'use client';

import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useRemoteMedia';

export const AUDIO_LEVEL_MAX = 3;

/** 내 마이크의 레벨 key. 원격은 participantId를 쓴다. */
export const SELF_AUDIO_KEY = 'self';

/** 한 번 이어 말할 때마다 seq가 오른다. 같은 사람이 다시 말해도 새 이벤트로 구분된다. */
export interface ActiveSpeaker {
  readonly participantId: string;
  readonly seq: number;
}

export interface UseSpeakerViewModel {
  readonly activeSpeaker: ActiveSpeaker | null;
}

export interface UseTileAudioLevelViewModel {
  /** 0(무음) ~ AUDIO_LEVEL_MAX. */
  readonly level: number;
  readonly isSpeaking: boolean;
}

export function useSpeakerViewModel(
  _localAudioTrack: MediaStreamTrack | null,
  _remoteMedia: ReadonlyArray<RemoteMediaEntry>,
): UseSpeakerViewModel {
  throw new Error('not implemented');
}

export function useTileAudioLevelViewModel(_key: string): UseTileAudioLevelViewModel {
  throw new Error('not implemented');
}

export function useSpeakerOrderViewModel(
  _participants: ReadonlyArray<RemoteParticipant>,
  _activeSpeaker: ActiveSpeaker | null,
  _visibleSlots: number,
): ReadonlyArray<RemoteParticipant> {
  throw new Error('not implemented');
}
