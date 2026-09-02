'use client';

import type { MeetingDetailResponse, MeetingStatus } from '@convene/shared-interfaces';

import type { MeetingCardStatus } from '@/feature/meeting/hooks/useMeetingCardViewModel';

export interface EmbedGateProps {
  readonly code: string;
  readonly pageUrl: string;
  readonly status: MeetingCardStatus;
  readonly meeting: MeetingDetailResponse | null;
}

/** 로딩·오류와 회의 상태를 한 축으로 합쳐 카드가 하나의 표시 상태만 다루게 한다. */
type CardStatus = Exclude<MeetingCardStatus, 'ready'> | MeetingStatus;

const STATUS_LABEL: Record<CardStatus, string> = {
  loading: '회의 정보를 불러오는 중',
  'not-found': '회의를 찾을 수 없습니다',
  error: '회의 정보를 불러오지 못했습니다',
  scheduled: '시작 전',
  open: '진행 중',
  closed: '종료된 회의',
};

const STATUS_TONE: Record<CardStatus, { readonly text: string; readonly dot: string }> = {
  loading: { text: 'text-muted', dot: 'bg-pending' },
  'not-found': { text: 'text-danger-on', dot: 'bg-danger' },
  error: { text: 'text-danger-on', dot: 'bg-danger' },
  scheduled: { text: 'text-text', dot: 'bg-pending' },
  open: { text: 'text-accent-on', dot: 'bg-positive' },
  closed: { text: 'text-muted', dot: 'bg-pending' },
};

function resolveCardStatus(status: MeetingCardStatus, meeting: MeetingDetailResponse | null) {
  return status === 'ready' && meeting !== null ? meeting.status : (status as CardStatus);
}

/**
 * 노션 등 다른 페이지에 iframe으로 삽입됐을 때 회의 대신 보여주는 진입 카드.
 *
 * 임베드하는 쪽이 `allow="camera; microphone"`을 주지 않으면 브라우저가 마이크·카메라를
 * 차단하므로(노션 embed가 그렇다) 회의를 열지 않고 상태만 보여준 뒤 새 탭으로 넘긴다.
 */
export function EmbedGate({ code, pageUrl, status, meeting }: EmbedGateProps) {
  const cardStatus = resolveCardStatus(status, meeting);
  // 아직 열리지 않았거나 진행 중일 때만 입장할 수 있다. 종료·오류·조회 중에는 링크를 감춘다.
  const joinable = cardStatus === 'scheduled' || cardStatus === 'open';
  const tone = STATUS_TONE[cardStatus];

  return (
    <div className="bg-bg text-text px-gutter-sm flex min-h-screen flex-col justify-center py-7">
      <div data-meeting-status={cardStatus}>
        <p className="flex items-center gap-2.5">
          <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone.dot}`} />
          <span className={`cap ${tone.text} md:tracking-[0.12em]`}>
            {STATUS_LABEL[cardStatus]}
            {cardStatus === 'open' &&
              meeting !== null &&
              ` · ${meeting.participantCount}명 참여 중`}
          </span>
        </p>

        <h2 className="text-text text-title mt-3 truncate font-extrabold tracking-[-0.032em]">
          {meeting?.title ?? '회의'}
        </h2>
        <p className="text-muted text-meta mt-1.5 font-mono tracking-wider">{code}</p>

        <p className="text-muted text-lead mt-4 max-w-[46ch]">
          {cardStatus === 'closed'
            ? '이미 종료된 회의입니다.'
            : cardStatus === 'not-found'
              ? '회의 코드가 잘못됐거나 이미 사라진 회의입니다.'
              : '삽입된 화면에서는 마이크와 카메라를 사용할 수 없어 새 탭에서 참가합니다.'}
        </p>

        {joinable && (
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-6"
          >
            새 탭에서 참가하기
          </a>
        )}
      </div>
    </div>
  );
}
