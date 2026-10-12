'use client';

import type { CSSProperties, ReactNode } from 'react';

import {
  FullscreenExitIcon,
  FullscreenIcon,
  REACTION_EMOJI,
  ZoomInIcon,
  ZoomOutIcon,
} from '@/feature/meeting/components/icons';
import { ScreenTile, VideoTile } from '@/feature/meeting/components/MeetingMedia';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { MeetingLayoutVariant } from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import type { RaisedHand, RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';
import type { ReactionBubble } from '@/feature/meeting/hooks/useReactionViewModel';
import {
  SCREEN_SCALES,
  type ScreenScale,
  useScreenViewerViewModel,
} from '@/feature/meeting/hooks/useScreenViewerViewModel';
import { SELF_AUDIO_KEY } from '@/feature/meeting/hooks/useSpeakerViewModel';

/** 같은 참가자의 카메라(screen 제외) 비디오 entry를 찾는다. */
const pickVideoEntry = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerId: string,
): RemoteMediaEntry | null => {
  for (const m of remoteMedia) {
    if (m.peerId === peerId && m.kind === 'video' && m.source !== 'screen') {
      return m;
    }
  }
  return null;
};

/** 같은 참가자의 마이크(audio) entry를 찾는다. */
const pickAudioEntry = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerId: string,
): RemoteMediaEntry | null => {
  for (const m of remoteMedia) {
    if (m.peerId === peerId && m.kind === 'audio') return m;
  }
  return null;
};

const pickScreenTrack = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerId: string,
): MediaStreamTrack | null => {
  for (const m of remoteMedia) {
    if (m.peerId === peerId && m.source === 'screen') return m.track;
  }
  return null;
};

/**
 * 12트랙 위의 타일별 grid-column. 한 줄에 3개면 span 4, 2개면 span 6이고,
 * 마지막 줄이 덜 찼으면 시작 위치를 밀어 가운데로 맞춘다.
 */
const DESKTOP_SPANS: Record<number, ReadonlyArray<string>> = {
  1: ['1 / span 12'],
  2: ['1 / span 6', '7 / span 6'],
  3: ['4 / span 6', '1 / span 6', '7 / span 6'],
  4: ['1 / span 6', '7 / span 6', '1 / span 6', '7 / span 6'],
  5: ['1 / span 4', '5 / span 4', '9 / span 4', '3 / span 4', '7 / span 4'],
  6: ['1 / span 4', '5 / span 4', '9 / span 4', '1 / span 4', '5 / span 4', '9 / span 4'],
  7: [
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '5 / span 4',
  ],
  8: [
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '3 / span 4',
    '7 / span 4',
  ],
  9: [
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
    '1 / span 4',
    '5 / span 4',
    '9 / span 4',
  ],
};

const MOBILE_SPANS: Record<number, ReadonlyArray<string>> = {
  1: ['1 / span 12'],
  2: ['1 / span 12', '1 / span 12'],
  3: ['4 / span 6', '1 / span 6', '7 / span 6'],
  4: ['1 / span 6', '7 / span 6', '1 / span 6', '7 / span 6'],
};

const spansFor = (variant: MeetingLayoutVariant, count: number): ReadonlyArray<string> => {
  const table = variant === 'mobile' ? MOBILE_SPANS : DESKTOP_SPANS;
  return table[count] ?? DESKTOP_SPANS[9];
};

/**
 * 행이 남은 높이를 나눠 갖는다. 타일에 고정 비율을 주면 뷰포트가 낮을 때
 * 자연 높이가 영역을 넘어 아랫줄이 잘린다 — 비율은 video 의 object-fit 이 맡는다.
 */
const NO_BUBBLES: ReadonlyArray<ReactionBubble> = [];
const NO_HANDS: ReadonlyArray<RaisedHand> = [];

/** 말풍선이 한 줄로 겹치지 않게 id로 가로 위치를 흩는다. */
const BUBBLE_LANES = 6;
const BUBBLE_LANE_PX = 14;

/**
 * 손 든 사람을 든 순서대로 — 비디오 영역 맨 위 한 줄.
 * 타일 배지만으로는 화면 공유 중 참가자 줄을 접으면 아무도 보이지 않는다.
 */
function RaisedHands({ hands }: { readonly hands: ReadonlyArray<RaisedHand> }) {
  if (hands.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="text-lg leading-none"
      >
        ✋
      </span>
      <ul
        aria-label="손 든 사람"
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        {hands.map((h) => (
          <li
            key={h.participantId}
            className="bg-accent/30 text-accent-on text-cap max-w-[9rem] truncate rounded-full px-2.5 py-1 font-bold"
          >
            {h.isSelf ? '나' : h.nickname}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 리액션 말풍선 — 비디오 영역 왼쪽 아래에서 떠올라 사라진다.
 * 타일이 아니라 영역 위에 얹어 화면 공유로 참가자 줄을 접어도 보이게 한다.
 */
function ReactionBubbles({ bubbles }: { readonly bubbles: ReadonlyArray<ReactionBubble> }) {
  if (bubbles.length === 0) return null;
  return (
    <div
      // 떠오르는 높이(cqh)의 기준 컨테이너.
      className="pointer-events-none absolute bottom-3 left-3 z-20 h-[min(70%,320px)] w-44 [container-type:size] md:bottom-5 md:left-5"
    >
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="animate-reaction-float absolute bottom-0"
          style={{ left: (b.id % BUBBLE_LANES) * BUBBLE_LANE_PX }}
        >
          <div
            role="img"
            aria-label={`${b.isSelf ? '나' : b.nickname}: ${REACTION_EMOJI[b.kind].label}`}
            className="animate-reaction-sway bg-bg/75 flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1.5 pr-3 shadow-lg backdrop-blur-sm"
          >
            <span
              aria-hidden="true"
              className="text-2xl leading-none md:text-3xl"
            >
              {REACTION_EMOJI[b.kind].glyph}
            </span>
            <span
              aria-hidden="true"
              className="text-text text-cap max-w-[7rem] truncate font-bold"
            >
              {b.isSelf ? '나' : b.nickname}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const scaleLabel = (scale: ScreenScale): string => {
  if (scale === 'fit') return '창에 맞춤';
  if (scale === 'fill') return '화면 채우기';
  return `${scale * 100}%${scale === 1 ? ' (원본 크기)' : ''}`;
};

/** 버튼에 보일 지금 배율. 휠로 맞춘 임의 배율은 반올림한 %로. */
const currentScaleLabel = (scale: ScreenScale | number): string =>
  typeof scale === 'number' ? `${Math.round(scale * 100)}%` : scaleLabel(scale);

const viewerButton =
  'flex h-9 items-center gap-1.5 rounded-full px-3 font-semibold transition-colors hover:bg-white/20';

const viewerIconButton =
  'grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:bg-transparent';

/**
 * 화면 공유 stage — 배율·이동과 전체화면을 직접 들고 있다.
 * 드래그마다 바뀌는 상태를 이 경계 안에 가둬 참가자 타일까지 다시 그리지 않는다.
 */
function ScreenStage({
  mediasoup,
  remoteParticipants,
  isStripOpen,
  onToggleStrip,
}: {
  readonly mediasoup: UseMediasoupViewModel;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly isStripOpen: boolean;
  readonly onToggleStrip?: () => void;
}) {
  const viewer = useScreenViewerViewModel();
  const cursor = viewer.canPan ? (viewer.isPanning ? 'cursor-grabbing' : 'cursor-grab') : '';

  return (
    <div
      ref={viewer.stageRef}
      data-testid="screen-stage"
      className="bg-screen-bg relative min-h-0 flex-1 overflow-hidden rounded-2xl shadow-[0_14px_40px_rgba(0,0,0,0.4)] md:rounded-[20px]"
    >
      {/* 드래그는 이 층에서만 받는다. 컨트롤까지 덮으면 pointer capture 가 버튼 클릭을 삼킨다. */}
      <div
        className={`absolute inset-0 ${cursor} ${viewer.canPan ? 'touch-none' : ''}`}
        onPointerDown={viewer.onPointerDown}
        onPointerMove={viewer.onPointerMove}
        onPointerUp={viewer.onPointerUp}
        onPointerCancel={viewer.onPointerUp}
      >
        {mediasoup.isSharingScreen && mediasoup.screenStream !== null && (
          <ScreenTile
            isSelf
            stream={mediasoup.screenStream}
            zoom={viewer.zoom}
            panX={viewer.panX}
            panY={viewer.panY}
          />
        )}
        {remoteParticipants.map((p) => {
          const track = pickScreenTrack(mediasoup.remoteMedia, p.participantId);
          if (track === null) return null;
          return (
            <ScreenTile
              key={`screen-${p.participantId}`}
              nickname={p.nickname}
              track={track}
              zoom={viewer.zoom}
              panX={viewer.panX}
              panY={viewer.panY}
            />
          );
        })}
      </div>

      {viewer.isMenuOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={viewer.closeMenu}
          className="absolute inset-0 z-10 cursor-default"
        />
      )}

      {/* 공유 화면(대개 밝다) 위에 얹히므로 이름표처럼 고정 색을 쓴다. */}
      <div className="text-cap absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-full bg-black/60 p-1 text-white backdrop-blur-sm md:right-5 md:top-5">
        <button
          type="button"
          onClick={viewer.zoomOut}
          disabled={!viewer.canZoomOut}
          aria-label="화면 축소"
          className={viewerIconButton}
        >
          <ZoomOutIcon className="h-[18px] w-[18px]" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={viewer.toggleMenu}
            aria-haspopup="menu"
            aria-expanded={viewer.isMenuOpen}
            aria-label={`보기 옵션: ${currentScaleLabel(viewer.scale)}`}
            className={viewerButton}
          >
            {currentScaleLabel(viewer.scale)}
            <span aria-hidden="true">▾</span>
          </button>
          {viewer.isMenuOpen && (
            <ul
              role="menu"
              aria-label="보기 옵션"
              onKeyDown={(e) => {
                if (e.key === 'Escape') viewer.closeMenu();
              }}
              className="absolute right-0 top-full mt-2 w-max min-w-[10rem] rounded-xl bg-black/80 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm"
            >
              {SCREEN_SCALES.map((s) => (
                <li
                  key={s}
                  role="none"
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={viewer.scale === s}
                    onClick={() => viewer.setScale(s)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/15"
                  >
                    <span
                      aria-hidden="true"
                      className="w-3"
                    >
                      {viewer.scale === s ? '✓' : ''}
                    </span>
                    {scaleLabel(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={viewer.zoomIn}
          disabled={!viewer.canZoomIn}
          aria-label="화면 확대"
          className={viewerIconButton}
        >
          <ZoomInIcon className="h-[18px] w-[18px]" />
        </button>
        {viewer.canFullscreen && (
          <button
            type="button"
            onClick={viewer.toggleFullscreen}
            aria-label={viewer.isFullscreen ? '전체화면 종료' : '전체화면'}
            className={viewerIconButton}
          >
            {viewer.isFullscreen ? (
              <FullscreenExitIcon className="h-[18px] w-[18px]" />
            ) : (
              <FullscreenIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        )}
      </div>

      {onToggleStrip !== undefined && !viewer.isFullscreen && (
        <button
          type="button"
          onClick={onToggleStrip}
          aria-expanded={isStripOpen}
          className="absolute bottom-0 left-1/2 z-10 hidden h-[26px] w-[360px] -translate-x-1/2 place-items-center rounded-t-xl bg-white/75 text-sm font-semibold text-[#5b5349] md:grid"
        >
          <span aria-hidden>{isStripOpen ? '˅' : '˄'}</span>
          <span className="sr-only">참가자 화면 {isStripOpen ? '접기' : '펼치기'}</span>
        </button>
      )}
    </div>
  );
}

const GRID_STYLE: CSSProperties = { gridAutoRows: 'minmax(0, 1fr)' };

const pagerButton =
  'grid h-12 w-12 place-items-center rounded-full bg-text/10 text-text transition-colors hover:bg-text/[0.18] disabled:cursor-not-allowed disabled:text-muted/50 md:h-11 md:w-11';

export interface VideoStageProps {
  readonly nickname: string | null;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly mediasoup: UseMediasoupViewModel;
  readonly isHandRaised?: boolean;
  readonly raisedHands?: ReadonlyArray<RaisedHand>;
  readonly reactionBubbles?: ReadonlyArray<ReactionBubble>;
  readonly variant?: MeetingLayoutVariant;
  /** 화면 공유 중 하단 참가자 줄 노출. */
  readonly isStripOpen?: boolean;
  readonly onToggleStrip?: () => void;
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
 * 회의 화면의 비디오 영역 — 공유 중이면 화면 stage + 가로 strip, 아니면 12트랙 그리드.
 * self 타일이 항상 첫 칸이고, 페이지네이션이 주어지면 그 배열을 페이지 단위로 자른다.
 */
export function VideoStage({
  nickname,
  remoteParticipants,
  mediasoup,
  isHandRaised = false,
  raisedHands = NO_HANDS,
  reactionBubbles = NO_BUBBLES,
  variant = 'desktop',
  isStripOpen = true,
  onToggleStrip,
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
    remoteParticipants.some(
      (p) => pickScreenTrack(mediasoup.remoteMedia, p.participantId) !== null,
    );

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
          isHandRaised={isHandRaised}
          audioLevelKey={SELF_AUDIO_KEY}
        />
      ),
    },
    ...remoteParticipants.map((p) => {
      const entry = pickVideoEntry(mediasoup.remoteMedia, p.participantId);
      const audioEntry = pickAudioEntry(mediasoup.remoteMedia, p.participantId);
      return {
        key: p.participantId,
        node: (
          <VideoTile
            label={p.nickname}
            track={entry?.track ?? null}
            isVideoOff={entry === null || entry.paused}
            isAudioOff={audioEntry === null || audioEntry.paused}
            isDisconnected={p.disconnected}
            isHandRaised={p.handRaisedAt !== null}
            audioLevelKey={p.participantId}
          />
        ),
      };
    }),
  ];
  const visibleTiles =
    page !== undefined && pageSize !== undefined
      ? tiles.slice(page * pageSize, page * pageSize + pageSize)
      : tiles;
  const spans = spansFor(variant, visibleTiles.length);

  return (
    /* 중앙 비디오 영역 — 스크롤 차단(overflow-hidden) */
    <div className="px-gutter-sm py-gutter-sm relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden md:gap-[18px]">
      <RaisedHands hands={raisedHands} />

      {/* 화면 공유 stage. 공유가 없으면 자리만 비운다(타일 컨테이너의 형제 위치를 유지). */}
      {hasScreen && (
        <ScreenStage
          mediasoup={mediasoup}
          remoteParticipants={remoteParticipants}
          isStripOpen={isStripOpen}
          onToggleStrip={onToggleStrip}
        />
      )}

      {hasScreen && onToggleStrip !== undefined && (
        <button
          type="button"
          onClick={onToggleStrip}
          aria-expanded={isStripOpen}
          className="bg-text/10 text-text hover:bg-text/[0.18] w-full shrink-0 rounded-xl py-2.5 text-xs font-semibold transition-colors md:hidden"
        >
          참가자 {isStripOpen ? '숨기기 ˄' : '보기 ˅'}
        </button>
      )}

      {/*
        타일 컨테이너는 공유 여부와 무관하게 같은 자리·같은 구조를 유지하고 배치만 바꾼다.
        트리 모양이 달라지면 React가 타일을 전부 재마운트해 <video>가 새로 만들어지고,
        그 순간 모든 참가자 영상이 끊긴다. — MeetingScreen.rerender.spec.tsx
          공유 중: 하단 가로 strip / 공유 없음: 12트랙 그리드
      */}
      <div
        className={
          hasScreen
            ? isStripOpen
              ? 'flex shrink-0 gap-2 overflow-x-auto md:gap-3.5'
              : 'hidden'
            : 'grid min-h-0 w-full flex-1 grid-cols-12 content-center gap-2 md:gap-3.5'
        }
        style={hasScreen ? undefined : GRID_STYLE}
      >
        {visibleTiles.map((tile, i) => (
          <div
            key={tile.key}
            className={hasScreen ? 'w-[168px] shrink-0 md:w-[236px]' : undefined}
            style={hasScreen ? { aspectRatio: '16 / 9' } : { gridColumn: spans[i], minHeight: 0 }}
          >
            {tile.node}
          </div>
        ))}
      </div>

      {pageCount !== undefined && pageCount > 1 && (
        <nav
          aria-label="비디오 페이지"
          className="flex shrink-0 items-center justify-between gap-3 md:justify-center"
        >
          <span className="text-muted text-meta font-mono font-medium">
            {(page ?? 0) + 1} / {pageCount}
          </span>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={onPrevPage}
              disabled={canPrev === false}
              aria-label="이전 페이지"
              className={pagerButton}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNextPage}
              disabled={canNext === false}
              aria-label="다음 페이지"
              className={pagerButton}
            >
              ›
            </button>
          </div>
        </nav>
      )}

      <ReactionBubbles bubbles={reactionBubbles} />
    </div>
  );
}
