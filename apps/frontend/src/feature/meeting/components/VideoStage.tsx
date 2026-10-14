'use client';

import type { ReactNode } from 'react';

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
import {
  type ShareView,
  type TileSize,
  useHorizontalSwipe,
} from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
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

const noop = (): void => {};

/** 모바일 공유 중 위치 — 첫 점이 공유 화면, 나머지가 참가자 페이지. */
function PageDots({ count, active }: { readonly count: number; readonly active: number }) {
  return (
    <div
      role="img"
      aria-label={active === 0 ? '공유 화면' : `참가자 ${active} / ${count - 1} 페이지`}
      className="pointer-events-none absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 gap-1.5"
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i === active ? 'bg-text' : 'bg-text/30'}`}
        />
      ))}
    </div>
  );
}

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

/** 호버가 되는 기기에서만 숨겼다가 띠에 마우스가 오면 보인다. 터치 기기는 늘 보인다. */
const hideUntilHover =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/strip:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100';

/** 참가자 줄 토글 — 공유 화면을 가리지 않도록 하단 띠에 호버할 때만 드러난다. */
function StripToggle({
  isOpen,
  onToggle,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="group/strip absolute bottom-0 left-1/2 z-10 flex h-14 w-[360px] -translate-x-1/2 items-end">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`grid h-[26px] w-full place-items-center rounded-t-xl bg-white/75 text-sm font-semibold text-[#5b5349] transition-opacity ${hideUntilHover}`}
      >
        <span aria-hidden="true">{isOpen ? '˅' : '˄'}</span>
        <span className="sr-only">참가자 화면 {isOpen ? '접기' : '펼치기'}</span>
      </button>
    </div>
  );
}

/**
 * 화면 공유 stage — 배율·이동과 전체화면을 직접 들고 있다.
 * 드래그마다 바뀌는 상태를 이 경계 안에 가둬 참가자 타일까지 다시 그리지 않는다.
 */
function ScreenStage({
  mediasoup,
  remoteParticipants,
  isHidden,
  isStripOpen,
  onToggleStrip,
}: {
  readonly mediasoup: UseMediasoupViewModel;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  /** 모바일에서 참가자 그리드로 넘긴 동안. 배율·이동을 지키려고 언마운트하지 않는다. */
  readonly isHidden: boolean;
  readonly isStripOpen: boolean;
  /** 주어질 때만(데스크톱) 참가자 줄 토글을 띄운다. */
  readonly onToggleStrip?: () => void;
}) {
  const viewer = useScreenViewerViewModel();
  const cursor = viewer.canPan ? (viewer.isPanning ? 'cursor-grabbing' : 'cursor-grab') : '';

  return (
    <div
      ref={viewer.stageRef}
      data-testid="screen-stage"
      className={`bg-screen-bg relative min-h-0 flex-1 overflow-hidden rounded-2xl ${isHidden ? 'hidden' : ''} shadow-[0_14px_40px_rgba(0,0,0,0.4)] md:rounded-[20px]`}
    >
      {/* 드래그는 이 층에서만 받는다. 컨트롤까지 덮으면 pointer capture 가 버튼 클릭을 삼킨다. */}
      <div
        className={`absolute inset-0 ${cursor} ${viewer.canPan ? 'touch-none' : ''}`}
        // 확대해 끌어 보는 중에는 이 드래그가 페이지 스와이프로 새지 않게 한다.
        data-no-swipe={viewer.canPan ? '' : undefined}
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
        <StripToggle
          isOpen={isStripOpen}
          onToggle={onToggleStrip}
        />
      )}
    </div>
  );
}

/** h-9 w-9 는 레이아웃 VM 의 PAGER_BUTTON_PX 와 같아야 한다. */
const pagerButton =
  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition-colors disabled:cursor-not-allowed';

/** 그리드 위에 떠 있는 버튼 — 타일 위에서도 보이게 반투명 배경을 깐다. */
const gridPagerButton = `${pagerButton} absolute top-1/2 z-10 -translate-y-1/2 bg-bg/70 text-text shadow-md backdrop-blur-sm hover:bg-bg/90 disabled:hidden`;

const stripPagerButton = `${pagerButton} bg-text/10 text-text hover:bg-text/[0.18] disabled:text-muted/50`;

export interface VideoStageProps {
  readonly nickname: string | null;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly mediasoup: UseMediasoupViewModel;
  readonly isHandRaised?: boolean;
  readonly raisedHands?: ReadonlyArray<RaisedHand>;
  readonly reactionBubbles?: ReadonlyArray<ReactionBubble>;
  /** 타일 영역 측정용. 레이아웃 VM 이 이 크기로 페이지 크기와 타일 크기를 정한다. */
  readonly tileAreaRef?: (el: HTMLElement | null) => void;
  /** 주어지지 않으면 타일이 칸을 채운다. */
  readonly tileSize?: TileSize | null;
  readonly tileGap?: number;
  /** 공유 중 보기. 기본은 데스크톱식 하단 참가자 줄. */
  readonly shareView?: ShareView;
  /** 좌우 스와이프로 페이지를 넘긴다(모바일). */
  readonly isSwipeable?: boolean;
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
 * 회의 화면의 비디오 영역 — 공유 중이면 화면 stage + 하단 참가자 줄, 아니면 그리드.
 * self 타일이 항상 첫 칸이고, 페이지네이션이 주어지면 그 배열을 페이지 단위로 자른다.
 * 어느 쪽이든 스크롤 없이 한 페이지씩 보이고 ‹ › 로 넘긴다.
 */
export function VideoStage({
  nickname,
  remoteParticipants,
  mediasoup,
  isHandRaised = false,
  raisedHands = NO_HANDS,
  reactionBubbles = NO_BUBBLES,
  tileAreaRef,
  tileSize = null,
  tileGap,
  shareView = 'strip',
  isSwipeable = false,
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
  const swipe = useHorizontalSwipe(onPrevPage ?? noop, onNextPage ?? noop);

  // 공유 중 모바일은 공유 화면과 참가자 그리드를 넘겨 가며 본다(데스크톱은 하단 줄).
  const isStrip = hasScreen && shareView === 'strip';
  const isGrid = !hasScreen || shareView === 'participants';
  const isMobileShare = hasScreen && shareView !== 'strip';
  // 참가자 첫 페이지에서도 공유 화면으로 돌아갈 ‹ 가 필요하다.
  const hasPager = (pageCount !== undefined && pageCount > 1) || shareView === 'participants';

  return (
    /* 중앙 비디오 영역 — 스크롤 차단(overflow-hidden) */
    <div
      className={`px-gutter-sm py-gutter-sm relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden md:gap-[18px] ${isSwipeable ? 'touch-pan-y' : ''}`}
      onPointerDown={isSwipeable ? swipe.onPointerDown : undefined}
      onPointerUp={isSwipeable ? swipe.onPointerUp : undefined}
    >
      <RaisedHands hands={raisedHands} />

      {/* 화면 공유 stage. 공유가 없으면 자리만 비운다(타일 컨테이너의 형제 위치를 유지). */}
      {hasScreen && (
        <ScreenStage
          mediasoup={mediasoup}
          remoteParticipants={remoteParticipants}
          isHidden={shareView === 'participants'}
          isStripOpen={isStripOpen}
          onToggleStrip={isStrip ? onToggleStrip : undefined}
        />
      )}

      {/*
        타일 컨테이너는 공유 여부와 무관하게 같은 자리·같은 구조를 유지하고 배치만 바꾼다.
        트리 모양이 달라지면 React가 타일을 전부 재마운트해 <video>가 새로 만들어지고,
        그 순간 모든 참가자 영상이 끊긴다. — MeetingScreen.rerender.spec.tsx
          데스크톱 공유 중: 하단 참가자 줄(양 끝에 ‹ ›)
          모바일 공유 중: 공유 화면일 땐 숨기고, 넘기면 그리드
          공유 없음: 그리드(좌우에 ‹ › 를 띄움)
        측정은 버튼까지 감싼 바깥 칸에서 한다. 버튼이 생겨도 측정 크기가 바뀌지 않아야
        페이지 크기가 흔들리지 않는다.
      */}
      <div
        ref={tileAreaRef}
        className={
          isGrid
            ? 'relative flex min-h-0 flex-1'
            : isStrip && isStripOpen
              ? 'flex shrink-0 items-center'
              : 'hidden'
        }
        style={{ gap: tileGap }}
      >
        {hasPager && (
          <button
            type="button"
            onClick={onPrevPage}
            disabled={canPrev === false}
            aria-label="이전 페이지"
            className={isStrip ? stripPagerButton : `${gridPagerButton} left-0`}
          >
            ‹
          </button>
        )}
        <div
          className={
            isStrip
              ? 'flex min-w-0 flex-1 justify-center overflow-hidden'
              : 'flex min-h-0 min-w-0 flex-1 flex-wrap content-center justify-center overflow-hidden'
          }
          style={{ gap: tileGap }}
        >
          {visibleTiles.map((tile) => (
            <div
              key={tile.key}
              className={tileSize === null ? 'min-h-0 min-w-0 flex-1' : 'shrink-0'}
              style={
                tileSize === null ? undefined : { width: tileSize.width, height: tileSize.height }
              }
            >
              {tile.node}
            </div>
          ))}
        </div>
        {hasPager && (
          <button
            type="button"
            onClick={onNextPage}
            disabled={canNext === false}
            aria-label="다음 페이지"
            className={isStrip ? stripPagerButton : `${gridPagerButton} right-0`}
          >
            ›
          </button>
        )}
        {hasPager && !hasScreen && (
          <span className="bg-bg/70 text-muted text-meta absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 font-mono font-medium backdrop-blur-sm">
            {(page ?? 0) + 1} / {pageCount}
          </span>
        )}
      </div>

      {isStrip && isStripOpen && hasPager && (
        <span className="text-muted text-meta -mt-1.5 shrink-0 self-center font-mono font-medium md:-mt-3">
          {(page ?? 0) + 1} / {pageCount}
        </span>
      )}

      {isMobileShare && (
        <PageDots
          count={1 + (pageCount ?? 1)}
          active={shareView === 'screen' ? 0 : 1 + (page ?? 0)}
        />
      )}

      <ReactionBubbles bubbles={reactionBubbles} />
    </div>
  );
}
