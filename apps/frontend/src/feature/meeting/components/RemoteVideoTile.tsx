'use client';

import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * 다른 참가자의 카메라/마이크 스트림을 보여주는 dumb tile.
 *
 * audio/video 트랙은 서로 다른 SFU consumer 에서 오므로, video 와 audio 요소를
 * 분리해 각각 MediaStream 으로 attach 한다(autoplay 정책 차이가 있어 합치는 게
 * 안전한 케이스가 많다).
 *
 * srcObject 는 ref callback 으로 attach 하여 React 외부 DOM property 를 다룬다.
 */
export interface RemoteVideoTileProps {
  readonly participant: Pick<RemoteParticipant, 'socketId' | 'nickname'>;
  readonly videoTrack: MediaStreamTrack | null;
  readonly audioTrack: MediaStreamTrack | null;
}

const attachTrack = (
  el: HTMLMediaElement | null,
  track: MediaStreamTrack | null,
): void => {
  if (el === null) return;
  if (track === null) {
    if (el.srcObject !== null) el.srcObject = null;
    return;
  }
  const current = el.srcObject as MediaStream | null;
  if (current !== null) {
    const has = current.getTracks().includes(track);
    if (has) return;
  }
  el.srcObject = new MediaStream([track]);
};

export function RemoteVideoTile({
  participant,
  videoTrack,
  audioTrack,
}: RemoteVideoTileProps) {
  return (
    <figure data-testid="remote-video-tile">
      <video
        ref={(el) => attachTrack(el, videoTrack)}
        autoPlay
        playsInline
      />
      {audioTrack !== null && (
        <audio ref={(el) => attachTrack(el, audioTrack)} autoPlay />
      )}
      <figcaption>{participant.nickname}</figcaption>
    </figure>
  );
}
