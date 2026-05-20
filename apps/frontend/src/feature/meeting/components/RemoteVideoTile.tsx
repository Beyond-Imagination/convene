'use client';

import { useMemo, useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * 다른 참가자의 카메라 스트림을 보여주는 dumb tile.
 *
 * 함정 해결(plum 패턴 도입, [[reference-plum-mediasoup]] §3):
 *  - `<video muted>` 항상 — autoplay 정책 회피. 원격 오디오는 별도 RemoteAudioPlayer
 *    가 처리(Cycle 2B). 본 컴포넌트는 video 만 책임.
 *  - `useMediaElementBinding` 으로 `loadeddata` 후 명시 `.play()` 호출
 *  - track 변경 시 새 MediaStream 으로 갱신, idempotent
 */
export interface RemoteVideoTileProps {
  readonly participant: Pick<RemoteParticipant, 'socketId' | 'nickname'>;
  readonly videoTrack: MediaStreamTrack | null;
}

export function RemoteVideoTile({ participant, videoTrack }: RemoteVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useMemo(
    () => (videoTrack === null ? null : new MediaStream([videoTrack])),
    [videoTrack],
  );
  useMediaElementBinding({ ref: videoRef, stream });
  return (
    <figure data-testid="remote-video-tile">
      <video ref={videoRef} autoPlay muted playsInline />
      <figcaption>{participant.nickname}</figcaption>
    </figure>
  );
}
