'use client';

import { LinkIcon } from '@/feature/meeting/components/icons';
import { MeetingControlBar } from '@/feature/meeting/components/MeetingControlBar';
import { RemoteAudioPlayer } from '@/feature/meeting/components/MeetingMedia';
import { VideoStage } from '@/feature/meeting/components/VideoStage';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import { useMeetingElapsedViewModel } from '@/feature/meeting/hooks/useMeetingElapsedViewModel';
import type { MeetingLayoutVariant } from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import {
  type CopyLinkStatus,
  useMeetingLinkViewModel,
} from '@/feature/meeting/hooks/useMeetingLinkViewModel';
import type {
  MeetingConnectionStatus,
  UseMeetingViewModel,
} from '@/feature/meeting/hooks/useMeetingViewModel';

const STATUS_TONE: Partial<
  Record<MeetingConnectionStatus, { readonly text: string; readonly dot: string }>
> = {
  joined: { text: 'text-accent-on', dot: 'bg-positive' },
  reconnecting: { text: 'text-pending', dot: 'bg-pending' },
};
const STATUS_TONE_DEFAULT = { text: 'text-muted', dot: 'bg-pending' } as const;

const statusLabel = (status: MeetingConnectionStatus): string =>
  status === 'joined' ? '연결됨' : status === 'reconnecting' ? '재접속 중…' : status;

const COPY_FEEDBACK: Record<Exclude<CopyLinkStatus, 'idle'>, string> = {
  copied: '링크 복사됨',
  error: '복사하지 못했습니다',
};

function MeetingTitle({ code, title }: { readonly code: string; readonly title: string | null }) {
  const { url, status, copy } = useMeetingLinkViewModel(code);
  const label = title ?? `회의 ${code}`;
  return (
    <h1 className="text-title flex min-w-0 items-center gap-2.5 font-bold tracking-[-0.025em]">
      <button
        type="button"
        onClick={copy}
        title={url}
        aria-label={`${label} — 회의 링크 복사`}
        className="text-text hover:text-accent-on group flex min-w-0 items-center gap-2 transition-colors"
      >
        <span className="truncate">
          {title ?? (
            <>
              회의 <span className="text-code font-mono font-medium">{code}</span>
            </>
          )}
        </span>
        <LinkIcon className="text-muted group-hover:text-accent-on h-4 w-4 shrink-0 transition-colors" />
      </button>
      {status !== 'idle' && (
        <span
          role="status"
          className={`text-meta shrink-0 font-semibold ${
            status === 'copied' ? 'text-positive' : 'text-danger-on'
          }`}
        >
          {COPY_FEEDBACK[status]}
        </span>
      )}
    </h1>
  );
}

/**
 * 경과 시간은 1초마다 바뀐다. 헤더에 인라인으로 두면 그 틱이 회의 화면 전체를 —
 * 참가자 수만큼 깔린 비디오 타일까지 — 다시 그린다. 상태를 이 경계 안에 가둔다.
 */
function MeetingElapsed({ startedAt }: { readonly startedAt: string | null }) {
  const { elapsed } = useMeetingElapsedViewModel(startedAt);
  if (elapsed === null) return null;
  return (
    <span className="text-muted text-meta hidden font-mono font-medium md:inline">{elapsed}</span>
  );
}

export interface MeetingScreenProps extends UseMeetingViewModel {
  readonly mediasoup: UseMediasoupViewModel;
  readonly title?: string | null;
  /** ISO 문자열. 경과 시간의 기준이다. */
  readonly startedAt?: string | null;
  readonly isChatOpen?: boolean;
  readonly onToggleChat?: () => void;
  readonly variant?: MeetingLayoutVariant;
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
  title = null,
  startedAt = null,
  isChatOpen,
  onToggleChat,
  variant,
  isStripOpen,
  onToggleStrip,
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
  const isSharing = mediasoup.isSharingScreen || mediasoup.isRemoteSharingScreen;
  const tone = STATUS_TONE[status] ?? STATUS_TONE_DEFAULT;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-border px-gutter py-gutter-sm flex items-center justify-between gap-3 border-b">
        <div className="min-w-0">
          <MeetingTitle
            code={code}
            title={title}
          />
          <p className="text-muted text-meta mt-1 truncate font-medium">
            {title !== null && <span className="font-mono">{code} · </span>}내 닉네임:{' '}
            {nickname ?? '(미인증)'} · 참가자 {participantCount}명
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:gap-6">
          <MeetingElapsed startedAt={startedAt} />
          {isSharing ? (
            <span className="bg-accent/30 text-accent-on text-meta whitespace-nowrap rounded-full px-3 py-1.5 font-bold">
              화면 공유 중
            </span>
          ) : (
            <span
              data-testid="connection-status"
              className={`text-meta flex items-center gap-1.5 whitespace-nowrap font-semibold md:gap-2.5 ${tone.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full md:h-2 md:w-2 ${tone.dot}`} />
              {statusLabel(status)}
            </span>
          )}
        </div>
      </header>

      {/* 상태 배너 (연결/미디어 진행·오류) — role/testid 보존 */}
      {(status === 'connecting' ||
        status === 'reconnecting' ||
        (status === 'error' && errorMessage !== null) ||
        mediaPreparing ||
        (mediasoup.status === 'error' && mediasoup.errorMessage !== null)) && (
        <div className="px-gutter flex flex-col gap-1 py-2">
          {status === 'reconnecting' && (
            <p
              className="text-pending text-cap"
              role="status"
            >
              연결이 끊겼습니다. 다시 연결하는 중입니다…
            </p>
          )}
          {status === 'connecting' && (
            <p
              role="status"
              aria-live="polite"
              className="text-muted text-meta"
            >
              연결 중…
            </p>
          )}
          {status === 'error' && errorMessage !== null && (
            <p
              role="alert"
              className="text-danger-on text-meta"
            >
              연결 실패: {errorMessage}
            </p>
          )}
          {mediaPreparing && (
            <p
              role="status"
              aria-live="polite"
              data-testid="mediasoup-status"
              className="text-muted text-meta"
            >
              미디어 준비 중…
            </p>
          )}
          {mediasoup.status === 'error' && mediasoup.errorMessage !== null && (
            <p
              role="alert"
              className="text-danger-on text-meta"
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
              key={p.participantId}
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
        variant={variant}
        isStripOpen={isStripOpen}
        onToggleStrip={onToggleStrip}
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
