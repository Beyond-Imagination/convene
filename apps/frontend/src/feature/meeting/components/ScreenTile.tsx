'use client';

import { useMemo, useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';

/**
 * 화면 공유 비디오 한 칸의 dumb tile.
 *
 * 함정 해결(plum 패턴 도입, [[reference-plum-mediasoup]] §3, §5):
 *  - 본인/원격 모두 `<video muted>` 강제 — getDisplayMedia 의 audio track 포함 가능성
 *    + autoplay 정책 회피
 *  - `useMediaElementBinding` 으로 명시 `.play()` 호출 + loadeddata + reject swallow
 */
export interface LocalScreenTileProps {
  readonly stream: MediaStream | null;
}

export function LocalScreenTile({ stream }: LocalScreenTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref: videoRef, stream });
  return (
    <figure data-testid="local-screen-tile">
      <video ref={videoRef} autoPlay muted playsInline />
      <figcaption>내 화면 (공유 중)</figcaption>
    </figure>
  );
}

export interface RemoteScreenTileProps {
  readonly nickname: string;
  readonly track: MediaStreamTrack;
}

export function RemoteScreenTile({ nickname, track }: RemoteScreenTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);
  useMediaElementBinding({ ref: videoRef, stream });
  return (
    <figure data-testid="remote-screen-tile">
      <video ref={videoRef} autoPlay muted playsInline />
      <figcaption>{nickname} 의 화면</figcaption>
    </figure>
  );
}
