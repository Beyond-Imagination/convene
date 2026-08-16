'use client';

import { memo, useMemo, useRef } from 'react';

import { MicOffIcon, VideoOffIcon } from '@/feature/meeting/components/icons';
import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

/**
 * red → orange → yellow → green → cyan → blue → violet → magenta.
 */
const PALETTE = [
  { avatar: 'bg-red-600', tile: 'bg-red-950' },
  { avatar: 'bg-orange-600', tile: 'bg-orange-950' },
  { avatar: 'bg-yellow-600', tile: 'bg-yellow-950' },
  { avatar: 'bg-emerald-600', tile: 'bg-emerald-950' },
  { avatar: 'bg-cyan-600', tile: 'bg-cyan-950' },
  { avatar: 'bg-blue-600', tile: 'bg-blue-950' },
  { avatar: 'bg-violet-600', tile: 'bg-violet-950' },
  { avatar: 'bg-fuchsia-600', tile: 'bg-fuchsia-950' },
] as const;

const colorFor = (label: string): (typeof PALETTE)[number] => {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};

/**
 * 내 미디어는 MediaStream으로, 원격 미디어는 트랙 하나로 도착한다. 트랙만 있으면 감싸서 같은 모양으로 맞춘다.
 */
const useTileStream = (
  stream: MediaStream | null | undefined,
  track: MediaStreamTrack | null | undefined,
): MediaStream | null =>
  useMemo(() => {
    if (stream != null) return stream;
    return track == null ? null : new MediaStream([track]);
  }, [stream, track]);

/**
 * 비디오가 꺼진(또는 아직 없는) 타일을 덮는 오버레이.
 * 검은 화면 대신 닉네임 이니셜 아바타 + 카메라 OFF 아이콘을 보여준다.
 * 색은 닉네임 해시로 정해 사람마다 다르되 같은 사람은 항상 같은 색을 쓴다.
 */
function VideoTilePlaceholder({ label }: { readonly label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const color = colorFor(label);
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 ${color.tile}`}
    >
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold text-white ${color.avatar}`}
      >
        {initial}
      </div>
      <VideoOffIcon className="h-7 w-7 text-white/70" />
    </div>
  );
}

export interface VideoTileProps {
  readonly label: string;
  /** 내 타일이면 이름표에 "(나)"를 붙인다. */
  readonly isSelf?: boolean;
  /** 내 카메라 스트림. 원격은 대신 track을 넘긴다. */
  readonly stream?: MediaStream | null;
  readonly track?: MediaStreamTrack | null;
  /** 카메라가 꺼져 있으면 검은 화면 대신 placeholder를 덮는다. */
  readonly isVideoOff?: boolean;
  /** 마이크가 음소거면 이름표에 마이크 OFF 배지를 표시한다. */
  readonly isAudioOff?: boolean;
  /** 연결이 끊겨 복귀를 기다리는 중. 타일은 유지하고 상태만 덮어 보여준다. */
  readonly isDisconnected?: boolean;
}

/**
 * 참가자 한 명의 카메라 타일.
 *
 * memo: 회의 화면은 채팅·참가자 입퇴장 등으로 자주 리렌더되는데, 타일은 화면에 참가자 수만큼
 * 깔려 있어 비용이 곱해진다. props(라벨·트랙·on/off)가 그대로면 다시 그리지 않는다.
 */
export const VideoTile = memo(function VideoTile({
  label,
  isSelf,
  stream,
  track,
  isVideoOff,
  isAudioOff,
  isDisconnected,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref: videoRef, stream: useTileStream(stream, track) });
  return (
    <figure
      data-testid={isSelf === true ? 'local-video-tile' : 'remote-video-tile'}
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
      {isDisconnected === true && (
        <div
          data-testid="tile-disconnected"
          className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-medium text-amber-300"
        >
          연결 끊김 · 재접속 대기 중
        </div>
      )}
      <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {isAudioOff === true && <MicOffIcon className="text-danger h-3.5 w-3.5" />}
        {label}
        {isSelf === true ? ' (나)' : ''}
      </figcaption>
    </figure>
  );
});

export interface ScreenTileProps {
  readonly isSelf?: boolean;
  /** 원격 공유일 때 이름표에 쓸 공유자 닉네임. */
  readonly nickname?: string;
  readonly stream?: MediaStream | null;
  readonly track?: MediaStreamTrack | null;
}

/** 화면 공유 비디오 한 칸. memo 이유는 VideoTile 과 같다. */
export const ScreenTile = memo(function ScreenTile({
  isSelf,
  nickname,
  stream,
  track,
}: ScreenTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref: videoRef, stream: useTileStream(stream, track) });
  return (
    <figure
      data-testid={isSelf === true ? 'local-screen-tile' : 'remote-screen-tile'}
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
        {isSelf === true ? '내 화면 (공유 중)' : `${nickname ?? ''} 의 화면`}
      </figcaption>
    </figure>
  );
});

/** memo: 재생 중인 `<audio>`는 track 이 그대로면 건드리지 않는다. */
const RemoteAudioEntry = memo(function RemoteAudioEntry({
  track,
}: {
  readonly track: MediaStreamTrack;
}) {
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
});

export interface RemoteAudioPlayerProps {
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
}

/**
 * 원격 참가자들의 audio 트랙을 별도 `<audio>` 요소로 재생하는 dumb 컴포넌트.
 * 비디오 타일과 분리해야 카메라를 꺼도 소리가 끊기지 않는다.
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
