'use client';

import { REACTION_KINDS } from '@convene/shared-interfaces';

import {
  ChatIcon,
  EndCallIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  REACTION_EMOJI,
  ReactionIcon,
  ScreenShareIcon,
  VideoIcon,
  VideoOffIcon,
} from '@/feature/meeting/components/icons';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseReactionViewModel } from '@/feature/meeting/hooks/useReactionViewModel';

/** 여섯 개가 한 줄에 다 못 들어가는 폭에서는 잘리는 대신 다음 줄로 넘긴다. */
const controlButton =
  'grid min-h-[60px] place-items-center gap-1.5 rounded-[18px] px-0.5 py-3 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed md:text-action md:flex md:min-h-0 md:items-center md:gap-2.5 md:rounded-full md:px-[clamp(0.75rem,0.3rem+0.9vw,1.375rem)] md:py-3.5';
const controlNeutral = 'bg-text/10 text-text hover:bg-text/[0.18]';
const controlOff = 'bg-danger/20 text-danger-on';
const controlActive = 'bg-accent/30 text-accent-on font-bold';
const controlBlocked = 'bg-text/[0.06] text-text/40';
const controlEnd =
  'bg-danger text-danger-fg font-bold shadow-[0_6px_16px_rgba(201,56,43,0.38)] hover:bg-danger-hover';

/** 모바일은 칸이 좁아 짧은 라벨만 보여 준다. 버튼의 접근성 이름은 aria-label 이 책임진다. */
function ControlLabel({ short, full }: { readonly short: string; readonly full: string }) {
  return (
    <>
      <span className="md:hidden">{short}</span>
      <span className="hidden whitespace-nowrap md:inline">{full}</span>
    </>
  );
}

export interface MeetingControlBarProps {
  readonly mediasoup: UseMediasoupViewModel;
  readonly isHost: boolean;
  readonly isChatOpen?: boolean;
  readonly onToggleChat?: () => void;
  readonly hasUnreadChat?: boolean;
  /** 주어지지 않으면 반응 버튼을 그리지 않는다. */
  readonly reaction?: Pick<
    UseReactionViewModel,
    'canReact' | 'isPickerOpen' | 'togglePicker' | 'closePicker' | 'react'
  >;
  readonly isHandRaised?: boolean;
  readonly onToggleHand?: () => void;
  readonly leave: () => void;
  readonly endMeeting: () => Promise<void>;
}

/** 회의 하단 컨트롤 바 — 마이크/카메라/화면공유/반응/채팅/나가기/종료. */
export function MeetingControlBar({
  mediasoup,
  isHost,
  isChatOpen,
  onToggleChat,
  hasUnreadChat = false,
  reaction,
  isHandRaised = false,
  onToggleHand,
  leave,
  endMeeting,
}: MeetingControlBarProps) {
  const micLabel = mediasoup.isAudioMuted ? '마이크 켜기' : '마이크 끄기';
  const camLabel = mediasoup.isVideoMuted ? '카메라 켜기' : '카메라 끄기';
  // transport 가 붙기 전에는 토글이 조용히 무시된다. 눌러도 아무 일이 없는 대신 못 누르게 한다.
  const mediaReady = mediasoup.status === 'ready';
  const micDisabled = !mediaReady || mediasoup.isAudioToggling;
  const shareDisabled = !mediaReady || mediasoup.isRemoteSharingScreen;

  return (
    <footer className="px-gutter-sm relative grid shrink-0 auto-cols-fr grid-flow-col gap-2 pb-7 pt-1.5 md:flex md:flex-wrap md:justify-center md:gap-2.5 md:pb-7 md:pt-6">
      <button
        type="button"
        onClick={mediasoup.toggleAudio}
        disabled={micDisabled}
        aria-label={micLabel}
        className={`${controlButton} ${
          micDisabled ? controlBlocked : mediasoup.isAudioMuted ? controlOff : controlNeutral
        }`}
      >
        {mediasoup.isAudioMuted ? <MicOffIcon /> : <MicIcon />}
        <ControlLabel
          short="마이크"
          full={micLabel}
        />
      </button>

      <button
        type="button"
        onClick={mediasoup.toggleVideo}
        disabled={!mediaReady}
        aria-label={camLabel}
        className={`${controlButton} ${
          !mediaReady ? controlBlocked : mediasoup.isVideoMuted ? controlOff : controlNeutral
        }`}
      >
        {mediasoup.isVideoMuted ? <VideoOffIcon /> : <VideoIcon />}
        <ControlLabel
          short="카메라"
          full={camLabel}
        />
      </button>

      {/* 모바일 브라우저는 화면 공유를 지원하지 않는다. contents 로 감싸 웹에서만 칸을 차지한다. */}
      <div className="hidden md:contents">
        {mediasoup.isSharingScreen ? (
          <button
            type="button"
            onClick={mediasoup.stopScreenShare}
            className={`${controlButton} ${controlActive}`}
          >
            <ScreenShareIcon />
            <span className="whitespace-nowrap">공유 중지</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void mediasoup.startScreenShare()}
            // 화면 공유는 동시 1인.
            disabled={shareDisabled}
            className={`${controlButton} ${shareDisabled ? controlBlocked : controlNeutral}`}
          >
            <ScreenShareIcon />
            <span className="whitespace-nowrap">화면 공유 시작</span>
          </button>
        )}
      </div>

      {reaction !== undefined && (
        <button
          type="button"
          onClick={reaction.togglePicker}
          aria-expanded={reaction.isPickerOpen}
          aria-label={isHandRaised ? '반응, 손 든 상태' : '반응'}
          className={`${controlButton} ${
            reaction.isPickerOpen || isHandRaised ? controlActive : controlNeutral
          }`}
        >
          {isHandRaised ? (
            <span
              aria-hidden="true"
              className="text-lg leading-5"
            >
              ✋
            </span>
          ) : (
            <ReactionIcon />
          )}
          반응
        </button>
      )}

      {reaction?.isPickerOpen === true && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="reaction-backdrop"
            onClick={reaction.closePicker}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            onKeyDown={(e) => {
              if (e.key === 'Escape') reaction.closePicker();
            }}
            className="border-border bg-paper absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          >
            <div
              role="group"
              aria-label="리액션"
              className="grid grid-cols-5 gap-1"
            >
              {REACTION_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => reaction.react(kind)}
                  disabled={!reaction.canReact}
                  aria-label={REACTION_EMOJI[kind].label}
                  title={REACTION_EMOJI[kind].label}
                  className="hover:bg-text/10 grid h-11 w-11 place-items-center rounded-xl text-2xl transition-transform hover:scale-110 disabled:opacity-40 md:h-12 md:w-12"
                >
                  {REACTION_EMOJI[kind].glyph}
                </button>
              ))}
            </div>
            {onToggleHand !== undefined && (
              <button
                type="button"
                onClick={onToggleHand}
                className={`text-action mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-semibold transition-colors ${
                  isHandRaised ? controlActive : controlNeutral
                }`}
              >
                <span aria-hidden="true">✋</span>
                {isHandRaised ? '손 내리기' : '손들기'}
              </button>
            )}
          </div>
        </>
      )}

      {onToggleChat !== undefined && (
        <button
          type="button"
          onClick={onToggleChat}
          aria-pressed={isChatOpen}
          className={`${controlButton} ${isChatOpen === true ? controlActive : controlNeutral}`}
        >
          <span className="relative inline-flex">
            <ChatIcon />
            {hasUnreadChat && (
              <span
                aria-hidden="true"
                className="bg-danger absolute -right-1 -top-1 h-2 w-2 rounded-full"
              />
            )}
          </span>
          채팅
          {hasUnreadChat && <span className="sr-only">, 새 메시지 있음</span>}
        </button>
      )}

      <div className="hidden md:block md:w-4" />

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
          aria-label="회의 종료"
          className={`${controlButton} ${controlEnd}`}
        >
          <EndCallIcon />
          <ControlLabel
            short="종료"
            full="회의 종료"
          />
        </button>
      )}
    </footer>
  );
}
