'use client';

import { useMemo, useRef } from 'react';

import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

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
  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
    />
  );
}

/**
 * 원격 참가자들의 audio 트랙을 별도 `<audio>` 요소로 재생하는 dumb 컴포넌트.
 */
export function RemoteAudioPlayer({ remoteMedia }: RemoteAudioPlayerProps) {
  const audioEntries = useMemo(() => remoteMedia.filter((m) => m.kind === 'audio'), [remoteMedia]);
  return (
    <div
      data-testid="remote-audio-player"
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      {audioEntries.map((entry) => (
        <RemoteAudioEntry
          key={entry.consumerId}
          track={entry.track}
        />
      ))}
    </div>
  );
}
