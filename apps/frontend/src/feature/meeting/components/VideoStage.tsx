'use client';

import type { ReactNode } from 'react';

import { LocalVideoTile } from '@/feature/meeting/components/LocalVideoTile';
import {
  gridDims,
  pickAudioEntry,
  pickScreenTrack,
  pickVideoEntry,
} from '@/feature/meeting/components/meeting-screen.helpers';
import { RemoteVideoTile } from '@/feature/meeting/components/RemoteVideoTile';
import { LocalScreenTile, RemoteScreenTile } from '@/feature/meeting/components/ScreenTile';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';

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
  const tiles: ReactNode[] = [
    <LocalVideoTile
      key="self"
      nickname={nickname}
      stream={mediasoup.localStream}
      isVideoOff={mediasoup.isVideoMuted}
      isAudioOff={mediasoup.isAudioMuted}
    />,
    ...remoteParticipants.map((p) => {
      const entry = pickVideoEntry(mediasoup.remoteMedia, p.socketId);
      const audioEntry = pickAudioEntry(mediasoup.remoteMedia, p.socketId);
      return (
        <RemoteVideoTile
          key={p.socketId}
          participant={p}
          videoTrack={entry?.track ?? null}
          isVideoOff={entry === null || entry.paused}
          isAudioOff={audioEntry === null || audioEntry.paused}
        />
      );
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
      {hasScreen ? (
        <>
          {/* 화면 공유 stage */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {mediasoup.isSharingScreen && mediasoup.screenStream !== null && (
              <LocalScreenTile stream={mediasoup.screenStream} />
            )}
            {remoteParticipants.map((p) => {
              const track = pickScreenTrack(mediasoup.remoteMedia, p.socketId);
              if (track === null) return null;
              return (
                <RemoteScreenTile
                  key={`screen-${p.socketId}`}
                  nickname={p.nickname}
                  track={track}
                />
              );
            })}
          </div>
          {/* 비디오 가로 strip */}
          <div className="mt-3 flex shrink-0 gap-3 overflow-hidden">
            {visibleTiles.map((tile, i) => (
              <div
                key={i}
                className="aspect-video w-44 shrink-0"
              >
                {tile}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* 비디오 균등 그리드 (self 첫 칸) — 빈칸 없이 영역을 꽉 채운다 */
        <div
          className="grid min-h-0 flex-1 gap-3"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {visibleTiles}
        </div>
      )}

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
