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
    <figure
      data-testid="local-screen-tile"
      className="relative m-0 max-h-[60vh] overflow-hidden rounded-lg border border-accent/40 bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="max-h-[60vh] w-full object-contain"
      />
      <figcaption className="absolute bottom-2 left-2 rounded-md bg-accent/80 px-2 py-0.5 text-xs font-medium text-white">
        내 화면 (공유 중)
      </figcaption>
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
    <figure
      data-testid="remote-screen-tile"
      className="relative m-0 max-h-[60vh] overflow-hidden rounded-lg border border-accent/40 bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="max-h-[60vh] w-full object-contain"
      />
      <figcaption className="absolute bottom-2 left-2 rounded-md bg-accent/80 px-2 py-0.5 text-xs font-medium text-white">
        {nickname} 의 화면
      </figcaption>
    </figure>
  );
}
