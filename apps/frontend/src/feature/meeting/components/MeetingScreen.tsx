'use client';

import type { ReactNode } from 'react';

import {
  ChatIcon,
  EndCallIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  VideoIcon,
  VideoOffIcon,
} from '@/feature/meeting/components/icons';
import { LocalVideoTile } from '@/feature/meeting/components/LocalVideoTile';
import { RemoteAudioPlayer } from '@/feature/meeting/components/RemoteAudioPlayer';
import { RemoteVideoTile } from '@/feature/meeting/components/RemoteVideoTile';
import { LocalScreenTile, RemoteScreenTile } from '@/feature/meeting/components/ScreenTile';
import type {
  RemoteMediaEntry,
  UseMediasoupViewModel,
} from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

export interface MeetingScreenProps extends UseMeetingViewModel {
  readonly mediasoup: UseMediasoupViewModel;
  readonly isChatOpen?: boolean;
  readonly onToggleChat?: () => void;
  /** 비디오 페이지네이션. 주어지지 않으면 전체 타일을 한 번에 표시한다. */
  readonly page?: number;
  readonly pageSize?: number;
  readonly pageCount?: number;
  readonly canPrev?: boolean;
  readonly canNext?: boolean;
  readonly onPrevPage?: () => void;
  readonly onNextPage?: () => void;
}

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

/** 컨트롤 바 버튼 공통 스타일. */
const controlButton =
  'flex flex-col items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const controlNeutral = 'text-text hover:bg-white/10';
const controlDanger = 'bg-danger/15 text-danger hover:bg-danger/25';
const controlActive = 'bg-accent/20 text-accent hover:bg-accent/30';

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

/**
 * 회의 화면의 dumb View.
 */
export function MeetingScreen({
  code,
  status,
  nickname,
  remoteParticipants,
  errorMessage,
  isHost,
  leave,
  endMeeting,
  mediasoup,
  isChatOpen,
  onToggleChat,
  page,
  pageSize,
  pageCount,
  canPrev,
  canNext,
  onPrevPage,
  onNextPage,
}: MeetingScreenProps) {
  const participantCount = remoteParticipants.length + (nickname !== null ? 1 : 0);
  const mediaPreparing = mediasoup.status === 'idle' || mediasoup.status === 'preparing';

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

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      {/* 상단 헤더 */}
      <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-text truncate text-base font-semibold">회의 {code}</h1>
          <p className="text-muted text-xs">
            내 닉네임: {nickname ?? '(미인증)'} · 참가자 {participantCount}명
          </p>
        </div>
        <span className="text-muted rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          {status === 'joined' ? '연결됨' : status}
        </span>
      </header>

      {/* 상태 배너 (연결/미디어 진행·오류) — role/testid 보존 */}
      {(status === 'connecting' ||
        (status === 'error' && errorMessage !== null) ||
        mediaPreparing ||
        (mediasoup.status === 'error' && mediasoup.errorMessage !== null)) && (
        <div className="flex flex-col gap-1 px-5 py-2">
          {status === 'connecting' && (
            <p
              role="status"
              aria-live="polite"
              className="text-muted text-sm"
            >
              연결 중…
            </p>
          )}
          {status === 'error' && errorMessage !== null && (
            <p
              role="alert"
              className="text-danger text-sm"
            >
              연결 실패: {errorMessage}
            </p>
          )}
          {mediaPreparing && (
            <p
              role="status"
              aria-live="polite"
              data-testid="mediasoup-status"
              className="text-muted text-sm"
            >
              미디어 준비 중…
            </p>
          )}
          {mediasoup.status === 'error' && mediasoup.errorMessage !== null && (
            <p
              role="alert"
              className="text-danger text-sm"
            >
              미디어 오류: {mediasoup.errorMessage}
            </p>
          )}
        </div>
      )}

      {/* 접근성용 참가자 목록 (시각적으로는 비디오 그리드가 대신함) */}
      <section
        aria-labelledby="participants-heading"
        className="sr-only"
      >
        <h2 id="participants-heading">참가자</h2>
        <ul>
          {nickname !== null && <li data-testid="self-participant">{nickname} (나)</li>}
          {remoteParticipants.map((p) => (
            <li
              key={p.socketId}
              data-testid="remote-participant"
            >
              {p.nickname}
            </li>
          ))}
        </ul>
      </section>

      {/* 중앙 비디오 영역 — 스크롤 차단(overflow-hidden) */}
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
              gridTemplateColumns: `repeat(${gridDims(visibleTiles.length).cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridDims(visibleTiles.length).rows}, minmax(0, 1fr))`,
            }}
          >
            {visibleTiles}
          </div>
        )}

        {/* 페이지네이션 컨트롤 */}
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

      {/* 원격 audio는 video와 분리된 별도 `<audio>` 요소로 재생 */}
      <RemoteAudioPlayer remoteMedia={mediasoup.remoteMedia} />

      {/* 하단 컨트롤 바 */}
      <footer className="border-border flex items-center justify-center gap-2 border-t px-5 py-3">
        <button
          type="button"
          onClick={mediasoup.toggleAudio}
          className={`${controlButton} ${mediasoup.isAudioMuted ? controlDanger : controlNeutral}`}
        >
          {mediasoup.isAudioMuted ? <MicOffIcon /> : <MicIcon />}
          {mediasoup.isAudioMuted ? '마이크 켜기' : '마이크 끄기'}
        </button>

        <button
          type="button"
          onClick={mediasoup.toggleVideo}
          className={`${controlButton} ${mediasoup.isVideoMuted ? controlDanger : controlNeutral}`}
        >
          {mediasoup.isVideoMuted ? <VideoOffIcon /> : <VideoIcon />}
          {mediasoup.isVideoMuted ? '카메라 켜기' : '카메라 끄기'}
        </button>

        {mediasoup.isSharingScreen ? (
          <button
            type="button"
            onClick={mediasoup.stopScreenShare}
            className={`${controlButton} ${controlActive}`}
          >
            <ScreenShareIcon />
            공유 중지
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void mediasoup.startScreenShare()}
            // 화면 공유는 동시 1인. 다른 참가자가 공유 중이면 비활성화.
            disabled={mediasoup.isRemoteSharingScreen}
            className={`${controlButton} ${controlNeutral}`}
          >
            <ScreenShareIcon />
            화면 공유 시작
          </button>
        )}

        {onToggleChat !== undefined && (
          <button
            type="button"
            onClick={onToggleChat}
            aria-pressed={isChatOpen}
            className={`${controlButton} ${isChatOpen ? controlActive : controlNeutral}`}
          >
            <ChatIcon />
            채팅
          </button>
        )}

        <div className="bg-border mx-1 h-9 w-px" />

        <button
          type="button"
          onClick={leave}
          className={`${controlButton} ${controlNeutral}`}
        >
          <LeaveIcon />
          나가기
        </button>

        {/* 회의 종료는 host(생성자)만. 비-host에게는 노출하지 않는다. */}
        {isHost && (
          <button
            type="button"
            onClick={() => void endMeeting()}
            className={`${controlButton} bg-danger hover:bg-danger-hover text-white`}
          >
            <EndCallIcon />
            회의 종료
          </button>
        )}
      </footer>
    </section>
  );
}
