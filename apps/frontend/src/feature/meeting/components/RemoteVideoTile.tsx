'use client';

import { useMemo, useRef } from 'react';

import { MicOffIcon } from '@/feature/meeting/components/icons';
import { VideoTilePlaceholder } from '@/feature/meeting/components/VideoTilePlaceholder';
import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * 다른 참가자의 카메라 스트림을 보여주는 dumb tile.
 *
 * 함정 해결:
 *  - `<video muted>` 항상 — autoplay 정책 회피. 원격 오디오는 별도 RemoteAudioPlayer
 *    가 처리한다. 본 컴포넌트는 video 만 책임.
 *  - `useMediaElementBinding` 으로 `loadeddata` 후 명시 `.play()` 호출
 *  - track 변경 시 새 MediaStream 으로 갱신, idempotent
 */
export interface RemoteVideoTileProps {
  readonly participant: Pick<RemoteParticipant, 'socketId' | 'nickname'>;
  readonly videoTrack: MediaStreamTrack | null;
  /** 비디오 트랙이 없거나 상대가 카메라를 끈(paused) 경우 placeholder 를 덮는다. */
  readonly isVideoOff?: boolean;
  /** 상대가 마이크를 음소거한 경우 이름표에 마이크 OFF 배지를 표시한다. */
  readonly isAudioOff?: boolean;
}

export function RemoteVideoTile({
  participant,
  videoTrack,
  isVideoOff,
  isAudioOff,
}: RemoteVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useMemo(
    () => (videoTrack === null ? null : new MediaStream([videoTrack])),
    [videoTrack],
  );
  useMediaElementBinding({ ref: videoRef, stream });
  return (
    <figure
      data-testid="remote-video-tile"
      className="relative m-0 h-full w-full overflow-hidden rounded-lg bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
      />
      {isVideoOff === true && <VideoTilePlaceholder label={participant.nickname} />}
      <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {isAudioOff === true && <MicOffIcon className="h-3.5 w-3.5 text-danger" />}
        {participant.nickname}
      </figcaption>
    </figure>
  );
}
