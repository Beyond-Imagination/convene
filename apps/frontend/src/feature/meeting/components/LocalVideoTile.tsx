'use client';

import { useRef } from 'react';

import { MicOffIcon } from '@/feature/meeting/components/icons';
import { VideoTilePlaceholder } from '@/feature/meeting/components/VideoTilePlaceholder';
import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';

export interface LocalVideoTileProps {
  readonly nickname: string | null;
  readonly stream: MediaStream | null;
  /** 내 카메라가 꺼져 있으면 검은 화면 대신 placeholder를 덮는다. */
  readonly isVideoOff?: boolean;
  /** 내 마이크가 음소거면 이름표에 마이크 OFF 배지를 표시한다. */
  readonly isAudioOff?: boolean;
}

/**
 * 자신의 카메라/마이크 스트림을 보여주는 dumb tile.
 */
export function LocalVideoTile({ nickname, stream, isVideoOff, isAudioOff }: LocalVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref: videoRef, stream });
  const label = nickname ?? '(미인증)';
  return (
    <figure
      data-testid="local-video-tile"
      className="relative m-0 h-full w-full overflow-hidden rounded-lg bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
      />
      {isVideoOff === true && <VideoTilePlaceholder label={label} />}
      <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {isAudioOff === true && <MicOffIcon className="text-danger h-3.5 w-3.5" />}
        {label} (나)
      </figcaption>
    </figure>
  );
}
