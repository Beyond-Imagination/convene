'use client';

import { useMemo, useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';

/*
 * 화면 공유 비디오 한 칸의 dumb tile.
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
      className="border-accent/40 relative m-0 max-h-[60vh] overflow-hidden rounded-lg border bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="max-h-[60vh] w-full object-contain"
      />
      <figcaption className="bg-accent/80 absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-xs font-medium text-white">
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
      className="border-accent/40 relative m-0 max-h-[60vh] overflow-hidden rounded-lg border bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="max-h-[60vh] w-full object-contain"
      />
      <figcaption className="bg-accent/80 absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-xs font-medium text-white">
        {nickname} 의 화면
      </figcaption>
    </figure>
  );
}
