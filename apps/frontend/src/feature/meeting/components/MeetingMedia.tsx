'use client';

import { memo, useMemo, useRef } from 'react';

import { MicOffIcon, VideoOffIcon } from '@/feature/meeting/components/icons';
import { useMediaElementBinding } from '@/feature/meeting/hooks/useMediaElementBinding';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

/** 이니셜 아바타 색. 채도를 낮춰 타일 배경과 부딪히지 않게 맞춘 8색. */
const AVATAR_COLORS = [
  'bg-[#7a6a5c]',
  'bg-[#5f8a74]',
  'bg-[#8a6f64]',
  'bg-[#7d6a83]',
  'bg-[#5d7f86]',
  'bg-[#8f7f6b]',
  'bg-[#8a6a52]',
  'bg-[#5f728a]',
] as const;

const avatarColorFor = (label: string): string => {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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
 * 색은 닉네임 해시로 정해 사람마다 다르되 같은 사람은 항상 같은 색을 쓴다.
 */
function VideoTilePlaceholder({ label }: { readonly label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="bg-tile-off absolute inset-0 grid place-items-center">
      <div
        className={`text-title grid h-11 w-11 place-items-center rounded-full font-bold text-white md:h-[58px] md:w-[58px] ${avatarColorFor(label)}`}
      >
        {initial}
      </div>
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
  /** 마이크가 음소거면 우하단에 마이크 OFF 배지를 표시한다. */
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
      className="bg-tile-off relative m-0 h-full w-full overflow-hidden rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.3)] md:rounded-2xl"
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
          className="bg-bg/70 text-pending text-cap absolute inset-0 grid place-items-center px-2 text-center font-semibold"
        >
          연결 끊김 · 재접속 대기 중
        </div>
      )}
      <figcaption className="bg-bg/70 text-text text-cap absolute bottom-2 left-2 max-w-[76%] truncate rounded-full px-2.5 py-1 font-bold md:bottom-[11px] md:left-[11px] md:px-[11px]">
        {label}
        {isSelf === true ? ' (나)' : ''}
      </figcaption>
      {(isVideoOff === true || isAudioOff === true) && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5 md:bottom-[11px] md:right-[11px]">
          {isVideoOff === true && <VideoOffIcon className="text-muted h-4 w-4" />}
          {isAudioOff === true && (
            <span className="bg-danger grid h-[22px] w-[22px] place-items-center rounded-full text-white md:h-[26px] md:w-[26px]">
              <MicOffIcon className="h-3 w-3 md:h-3.5 md:w-3.5" />
            </span>
          )}
        </div>
      )}
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

/**
 * 화면 공유 비디오 한 칸. 이름표는 공유되는 화면(대개 밝다) 위에 얹히므로
 * 테마 토큰 대신 고정 색을 쓴다. memo 이유는 VideoTile 과 같다.
 */
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
      className="relative m-0 h-full w-full overflow-hidden"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-contain"
      />
      <figcaption className="text-action absolute left-3 top-3 rounded-full bg-white/75 px-3 py-1.5 font-bold text-[#5b5349] md:left-[22px] md:top-5 md:px-4 md:py-2">
        {isSelf === true ? '내 화면 (공유 중)' : `${nickname ?? ''}의 화면`}
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
