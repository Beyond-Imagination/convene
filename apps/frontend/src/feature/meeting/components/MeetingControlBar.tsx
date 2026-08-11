'use client';

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
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';

/** 컨트롤 바 버튼 공통 스타일. */
const controlButton =
  'flex flex-col items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const controlNeutral = 'text-text hover:bg-white/10';
const controlDanger = 'bg-danger/15 text-danger hover:bg-danger/25';
const controlActive = 'bg-accent/20 text-accent hover:bg-accent/30';

export interface MeetingControlBarProps {
  readonly mediasoup: UseMediasoupViewModel;
  readonly isHost: boolean;
  readonly isChatOpen?: boolean;
  readonly onToggleChat?: () => void;
  readonly leave: () => void;
  readonly endMeeting: () => Promise<void>;
}

/** 회의 하단 컨트롤 바 — 마이크/카메라/화면공유/채팅/나가기/종료. */
export function MeetingControlBar({
  mediasoup,
  isHost,
  isChatOpen,
  onToggleChat,
  leave,
  endMeeting,
}: MeetingControlBarProps) {
  return (
    <footer className="border-border flex items-center justify-center gap-2 border-t px-5 py-3">
      <button
        type="button"
        onClick={mediasoup.toggleAudio}
        disabled={mediasoup.isAudioToggling}
        className={`${controlButton} ${mediasoup.isAudioMuted ? controlDanger : controlNeutral} disabled:cursor-not-allowed disabled:opacity-50`}
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
  );
}
