'use client';

import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

/**
 * 원격 참가자들의 audio 트랙을 별도 `<audio>` 요소로 재생하는 dumb 컴포넌트 — stub.
 * 실제 구현은 후속 커밋. plum `RemoteAudioPlayer.tsx` 패턴 차용.
 */
export interface RemoteAudioPlayerProps {
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
}

export function RemoteAudioPlayer(_props: RemoteAudioPlayerProps) {
  throw new Error('not implemented');
}
