import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

/** 같은 참가자의 카메라(screen 제외) 비디오 entry를 찾는다. */
export const pickVideoEntry = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
): RemoteMediaEntry | null => {
  for (const m of remoteMedia) {
    if (m.peerSocketId === peerSocketId && m.kind === 'video' && m.source !== 'screen') {
      return m;
    }
  }
  return null;
};

/** 같은 참가자의 마이크(audio) entry를 찾는다. */
export const pickAudioEntry = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
): RemoteMediaEntry | null => {
  for (const m of remoteMedia) {
    if (m.peerSocketId === peerSocketId && m.kind === 'audio') return m;
  }
  return null;
};

export const pickScreenTrack = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
): MediaStreamTrack | null => {
  for (const m of remoteMedia) {
    if (m.peerSocketId === peerSocketId && m.source === 'screen') return m.track;
  }
  return null;
};

/**
 * 타일 수에 맞춰 빈칸 없이 영역을 채우는 열/행 수를 정한다(Zoom 갤러리 톤).
 * 2명이면 2칸, 3명이면 3칸으로 가로로 꽉 채우고, 그 이상은 균형 잡힌 격자로.
 */
export const gridDims = (count: number): { cols: number; rows: number } => {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
};
