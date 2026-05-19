'use client';

/**
 * 화면 공유 비디오 한 칸의 dumb tile.
 *
 * - local: 본인의 getDisplayMedia MediaStream 을 그대로 srcObject 로 부착.
 *   에코 방지를 위해 muted.
 * - remote: 다른 참가자의 mediasoup consumer track 1개를 받아 MediaStream 으로
 *   감싸 부착. autoplay 가능하도록 audio=false.
 *
 * srcObject 는 React prop 으로 직접 표현 못 해 ref callback 에서 attach 한다
 * (ARCHITECTURE §4.2 — View 가 useState/useEffect 를 쓰지 않도록 ref callback 만).
 */
export interface LocalScreenTileProps {
  readonly stream: MediaStream | null;
}

export function LocalScreenTile({ stream }: LocalScreenTileProps) {
  return (
    <figure data-testid="local-screen-tile">
      <video
        ref={(el) => {
          if (el === null) return;
          if (el.srcObject !== stream) el.srcObject = stream;
        }}
        autoPlay
        muted
        playsInline
      />
      <figcaption>내 화면 (공유 중)</figcaption>
    </figure>
  );
}

export interface RemoteScreenTileProps {
  readonly nickname: string;
  readonly track: MediaStreamTrack;
}

export function RemoteScreenTile({ nickname, track }: RemoteScreenTileProps) {
  return (
    <figure data-testid="remote-screen-tile">
      <video
        ref={(el) => {
          if (el === null) return;
          const current = el.srcObject as MediaStream | null;
          if (current !== null && current.getTracks().includes(track)) return;
          el.srcObject = new MediaStream([track]);
        }}
        autoPlay
        playsInline
      />
      <figcaption>{nickname} 의 화면</figcaption>
    </figure>
  );
}
