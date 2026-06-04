'use client';

import { useMemo, useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

/**
 * 원격 참가자들의 audio 트랙을 별도 `<audio>` 요소로 재생하는 dumb 컴포넌트.
 *
 * 다음 함정을 해결한다:
 *  - video tile 은 `<video muted>` 강제 → 본 컴포넌트가 audio 만 담당해 충돌 회피
 *  - 각 consumer 마다 독립 `<audio>` 요소 + useMediaElementBinding 으로 명시 play()
 *  - 화면에는 보이지 않게 aria-hidden + 시각적 hidden (sr-only 와 유사)
 *
 * View 는 dumb — props 만 받아 audio 요소 렌더. 모든 attach/play 흐름은 hook 이 캡슐화.
 */
export interface RemoteAudioPlayerProps {
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
}

interface RemoteAudioEntryProps {
  readonly track: MediaStreamTrack;
}

function RemoteAudioEntry({ track }: RemoteAudioEntryProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);
  useMediaElementBinding({ ref: audioRef, stream });
  return <audio ref={audioRef} autoPlay playsInline />;
}

export function RemoteAudioPlayer({ remoteMedia }: RemoteAudioPlayerProps) {
  const audioEntries = useMemo(
    () => remoteMedia.filter((m) => m.kind === 'audio'),
    [remoteMedia],
  );
  return (
    <div
      data-testid="remote-audio-player"
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      {audioEntries.map((entry) => (
        <RemoteAudioEntry key={entry.consumerId} track={entry.track} />
      ))}
    </div>
  );
}
