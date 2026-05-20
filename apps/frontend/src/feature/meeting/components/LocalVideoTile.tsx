'use client';

import { useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';

/**
 * 자신의 카메라/마이크 스트림을 보여주는 dumb tile.
 *
 * 함정 해결(plum 패턴 도입, [[reference-plum-mediasoup]] §3):
 *  - `<video muted>` 항상 — 본인 오디오 에코 방지 + autoplay 정책 회피
 *  - `useMediaElementBinding` 으로 `loadeddata` 후 명시 `.play()` 호출 + reject swallow
 *  - srcObject idempotent + cleanup 시 pause + 리스너 제거
 */
export interface LocalVideoTileProps {
  readonly nickname: string | null;
  readonly stream: MediaStream | null;
}

export function LocalVideoTile({ nickname, stream }: LocalVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref: videoRef, stream });
  return (
    <figure data-testid="local-video-tile">
      <video ref={videoRef} autoPlay muted playsInline />
      <figcaption>{nickname ?? '(미인증)'} (나)</figcaption>
    </figure>
  );
}
