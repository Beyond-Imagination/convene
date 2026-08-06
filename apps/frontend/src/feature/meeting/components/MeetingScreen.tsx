'use client';

import { MeetingControlBar } from '@/feature/meeting/components/MeetingControlBar';
import { RemoteAudioPlayer } from '@/feature/meeting/components/RemoteAudioPlayer';
import { VideoStage } from '@/feature/meeting/components/VideoStage';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
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

/**
 * 회의 화면의 dumb View — 헤더·상태 배너·접근성 목록만 직접 그리고,
 * 비디오 영역과 컨트롤 바는 VideoStage / MeetingControlBar 에 위임한다.
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

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
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

      <VideoStage
        nickname={nickname}
        remoteParticipants={remoteParticipants}
        mediasoup={mediasoup}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        canPrev={canPrev}
        canNext={canNext}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
      />

      {/* 원격 audio는 video와 분리된 별도 `<audio>` 요소로 재생 */}
      <RemoteAudioPlayer remoteMedia={mediasoup.remoteMedia} />

      <MeetingControlBar
        mediasoup={mediasoup}
        isHost={isHost}
        isChatOpen={isChatOpen}
        onToggleChat={onToggleChat}
        leave={leave}
        endMeeting={endMeeting}
      />
    </section>
  );
}
