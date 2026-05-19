'use client';

/**
 * 자신의 카메라/마이크 스트림을 보여주는 dumb tile.
 *
 * `srcObject` 는 React 가 직접 표현할 수 있는 DOM property 가 아니라 setter 가
 * 필요해, useEffect 대신 ref callback 으로 attach 한다. View 가 useState/
 * useEffect 를 사용하지 않는 ARCHITECTURE §4.2 규칙을 깨지 않는다.
 *
 * `muted` 는 자기 자신의 오디오 에코를 막기 위해 필수.
 */
export interface LocalVideoTileProps {
  readonly nickname: string | null;
  readonly stream: MediaStream | null;
}

export function LocalVideoTile({ nickname, stream }: LocalVideoTileProps) {
  return (
    <figure data-testid="local-video-tile">
      <video
        ref={(el) => {
          if (el === null) return;
          if (el.srcObject !== stream) el.srcObject = stream;
        }}
        autoPlay
        muted
        playsInline
      />
      <figcaption>{nickname ?? '(미인증)'} (나)</figcaption>
    </figure>
  );
}
