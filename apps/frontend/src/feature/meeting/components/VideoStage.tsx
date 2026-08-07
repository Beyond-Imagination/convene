'use client';

import type { ReactNode } from 'react';

import { ScreenTile, VideoTile } from '@/feature/meeting/components/MeetingMedia';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';

/** 같은 참가자의 카메라(screen 제외) 비디오 entry를 찾는다. */
const pickVideoEntry = (
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
const pickAudioEntry = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
): RemoteMediaEntry | null => {
  for (const m of remoteMedia) {
    if (m.peerSocketId === peerSocketId && m.kind === 'audio') return m;
  }
  return null;
};

const pickScreenTrack = (
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
const gridDims = (count: number): { cols: number; rows: number } => {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
};

export interface VideoStageProps {
  readonly nickname: string | null;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly mediasoup: UseMediasoupViewModel;
  /** 비디오 페이지네이션. 주어지지 않으면 전체 타일을 한 번에 표시한다. */
  readonly page?: number;
  readonly pageSize?: number;
  readonly pageCount?: number;
  readonly canPrev?: boolean;
  readonly canNext?: boolean;
  readonly onPrevPage?: () => void;
  readonly onNextPage?: () => void;
}

/**
 * 회의 화면의 비디오 영역 — 공유 중이면 화면 stage + 가로 strip, 아니면 균등 그리드.
 * self 타일이 항상 첫 칸이고, 페이지네이션이 주어지면 그 배열을 페이지 단위로 자른다.
 */
export function VideoStage({
  nickname,
  remoteParticipants,
  mediasoup,
  page,
  pageSize,
  pageCount,
  canPrev,
  canNext,
  onPrevPage,
  onNextPage,
}: VideoStageProps) {
  const hasScreen =
    mediasoup.isSharingScreen ||
    remoteParticipants.some((p) => pickScreenTrack(mediasoup.remoteMedia, p.socketId) !== null);

  // self(첫 칸) + 원격 카메라 타일을 한 배열로 만든 뒤 페이지 단위로 자른다.
  // 배치(그리드/strip)가 바뀌어도 같은 key로 같은 자리에 남아야 <video>가 재생성되지 않으므로
  // key를 노드와 함께 들고 다닌다.
  const tiles: ReadonlyArray<{ key: string; node: ReactNode }> = [
    {
      key: 'self',
      node: (
        <VideoTile
          isSelf
          label={nickname ?? '(미인증)'}
          stream={mediasoup.localStream}
          isVideoOff={mediasoup.isVideoMuted}
          isAudioOff={mediasoup.isAudioMuted}
        />
      ),
    },
    ...remoteParticipants.map((p) => {
      const entry = pickVideoEntry(mediasoup.remoteMedia, p.socketId);
      const audioEntry = pickAudioEntry(mediasoup.remoteMedia, p.socketId);
      return {
        key: p.socketId,
        node: (
          <VideoTile
            label={p.nickname}
            track={entry?.track ?? null}
            isVideoOff={entry === null || entry.paused}
            isAudioOff={audioEntry === null || audioEntry.paused}
          />
        ),
      };
    }),
  ];
  const visibleTiles =
    page !== undefined && pageSize !== undefined
      ? tiles.slice(page * pageSize, page * pageSize + pageSize)
      : tiles;
  const { cols, rows } = gridDims(visibleTiles.length);

  return (
    /* 중앙 비디오 영역 — 스크롤 차단(overflow-hidden) */
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      {/* 화면 공유 stage. 공유가 없으면 자리만 비운다(타일 컨테이너의 형제 위치를 유지). */}
      {hasScreen && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {mediasoup.isSharingScreen && mediasoup.screenStream !== null && (
            <ScreenTile
              isSelf
              stream={mediasoup.screenStream}
            />
          )}
          {remoteParticipants.map((p) => {
            const track = pickScreenTrack(mediasoup.remoteMedia, p.socketId);
            if (track === null) return null;
            return (
              <ScreenTile
                key={`screen-${p.socketId}`}
                nickname={p.nickname}
                track={track}
              />
            );
          })}
        </div>
      )}

      {/*
        타일 컨테이너는 공유 여부와 무관하게 같은 자리·같은 구조를 유지하고 배치만 바꾼다.
        트리 모양이 달라지면 React가 타일을 전부 재마운트해 <video>가 새로 만들어지고,
        그 순간 모든 참가자 영상이 끊긴다. — MeetingScreen.rerender.spec.tsx
          공유 중: 하단 가로 strip / 공유 없음: 빈칸 없이 꽉 채우는 균등 그리드
      */}
      <div
        className={
          hasScreen
            ? 'mt-3 flex shrink-0 gap-3 overflow-hidden'
            : 'grid min-h-0 flex-1 gap-3'
        }
        style={
          hasScreen
            ? undefined
            : {
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }
        }
      >
        {visibleTiles.map((tile) => (
          <div
            key={tile.key}
            className={hasScreen ? 'aspect-video w-44 shrink-0' : 'min-h-0'}
          >
            {tile.node}
          </div>
        ))}
      </div>

      {pageCount !== undefined && pageCount > 1 && (
        <nav
          aria-label="비디오 페이지"
          className="mt-3 flex shrink-0 items-center justify-center gap-3"
        >
          <button
            type="button"
            onClick={onPrevPage}
            disabled={canPrev === false}
            aria-label="이전 페이지"
            className="border-border text-text flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-muted text-xs font-medium">
            {(page ?? 0) + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={onNextPage}
            disabled={canNext === false}
            aria-label="다음 페이지"
            className="border-border text-text flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
