'use client';

import Link from 'next/link';

import type { MeetingConnectionStatus } from '@/feature/meeting/hooks/useMeetingViewModel';

/** 없는 회의는 재시도해도 달라지지 않고, 그 외 실패는 다시 시도해 볼 여지가 있다. */
type EntryBlock = 'not-found' | 'failed';

const COPY: Record<EntryBlock, { readonly heading: string; readonly detail: string }> = {
  'not-found': {
    heading: '회의를 찾을 수 없습니다',
    detail: '회의 코드가 잘못됐거나 이미 사라진 회의입니다.',
  },
  failed: {
    heading: '회의에 입장하지 못했습니다',
    detail: '잠시 후 링크로 다시 시도해 주세요.',
  },
};

export interface MeetingEntryBlockedProps {
  readonly code: string;
  readonly status: MeetingConnectionStatus;
  /** ViewModel이 준 실패 사유. 없으면 상태별 기본 안내를 쓴다. */
  readonly message?: string | null;
}

/**
 * 입장이 확정되지 못한 사용자에게 회의 화면 대신 보여주는 차단 View.
 *
 * 없는 회의 코드로도 회의 화면이 열리면 참가자 수·채팅·미디어가 모두 비어 있는
 * "가짜 회의"에 들어간 것처럼 보인다. 입장 전 실패는 회의 화면 자체를 열지 않는다.
 */
export function MeetingEntryBlocked({ code, status, message = null }: MeetingEntryBlockedProps) {
  const block: EntryBlock = status === 'not-found' ? 'not-found' : 'failed';
  const copy = COPY[block];

  return (
    <div
      data-testid="meeting-entry-blocked"
      data-entry-block={block}
      className="bg-bg text-text relative flex h-screen items-center justify-center overflow-hidden"
    >
      <div
        className="absolute inset-0 flex flex-col"
        aria-hidden="true"
      >
        <header className="border-border px-gutter py-gutter-sm border-b">
          <p className="text-muted text-meta font-mono font-medium">회의 {code}</p>
        </header>
        <div className="flex-1" />
      </div>

      <div className="bg-paper relative z-10 mx-4 w-full max-w-[clamp(22.5rem,20.588rem+7.843vw,30rem)] p-[clamp(1.75rem,1.4375rem+1.2549vw,2.5rem)] shadow-[0_20px_46px_rgba(0,0,0,0.28)]">
        <p className="flex items-center gap-2.5">
          <span className="bg-danger h-[7px] w-[7px] shrink-0 rounded-full" />
          <span className="cap text-danger-on md:tracking-[0.12em]">입장 불가</span>
        </p>
        <h1
          role="alert"
          className="text-text text-title mt-3 font-extrabold tracking-[-0.03em]"
        >
          {copy.heading}
        </h1>
        <p className="text-muted text-meta mt-1.5 font-mono tracking-wider">{code}</p>
        <p className="text-muted text-lead mt-4">{message ?? copy.detail}</p>
        <Link
          href="/"
          className="btn-primary mt-6 block w-full text-center"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
