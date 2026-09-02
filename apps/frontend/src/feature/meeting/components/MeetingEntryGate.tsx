'use client';

import Link from 'next/link';

import type { MeetingEntryBlock } from '@/feature/meeting/hooks/useMeetingViewModel';

export type MeetingEntryState = 'checking' | MeetingEntryBlock;

interface StateCopy {
  readonly chip: string;
  readonly heading: string;
  readonly detail: string;
  readonly link: { readonly href: string; readonly label: string } | null;
}

const COPY: Record<MeetingEntryState, StateCopy> = {
  checking: {
    chip: '확인 중',
    heading: '회의 정보를 확인하는 중',
    detail: '입장할 수 있는 회의인지 확인하고 있습니다.',
    link: null,
  },
  'not-found': {
    chip: '입장 불가',
    heading: '회의를 찾을 수 없습니다',
    detail: '회의 코드가 잘못됐거나 이미 사라진 회의입니다.',
    link: { href: '/', label: '홈으로 돌아가기' },
  },
  closed: {
    chip: '입장 불가',
    heading: '이미 종료된 회의입니다',
    detail: '종료된 회의에는 다시 입장할 수 없습니다. 회의록에서 내용을 확인하세요.',
    link: { href: '/reports', label: '회의록 보러 가기' },
  },
  failed: {
    chip: '입장 불가',
    heading: '회의에 입장하지 못했습니다',
    detail: '잠시 후 링크로 다시 시도해 주세요.',
    link: { href: '/', label: '홈으로 돌아가기' },
  },
};

export interface MeetingEntryGateProps {
  readonly code: string;
  readonly state: MeetingEntryState;
  readonly message?: string | null;
}

/**
 * 회의 화면 대신 그리는 진입 화면. 판정 중과 차단을 같은 카드에서 다룬다.
 * 없는 회의로도 회의 화면이 열리면 참가자도 채팅도 없는 "가짜 회의"에 들어간 것처럼 보인다.
 */
export function MeetingEntryGate({ code, state, message = null }: MeetingEntryGateProps) {
  const copy = COPY[state];
  const checking = state === 'checking';
  // 아는 사유는 화면이 문구를 갖는다. 원인을 모르는 실패만 ViewModel이 준 메시지를 쓴다.
  const detail = state === 'failed' ? (message ?? copy.detail) : copy.detail;

  return (
    <div
      data-testid="meeting-entry-gate"
      data-entry-state={state}
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
          <span
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${
              checking ? 'bg-pending animate-pulse' : 'bg-danger'
            }`}
          />
          <span
            className={`cap md:tracking-[0.12em] ${checking ? 'text-muted' : 'text-danger-on'}`}
          >
            {copy.chip}
          </span>
        </p>
        <h1
          role={checking ? 'status' : 'alert'}
          aria-live="polite"
          className="text-text text-title mt-3 font-extrabold tracking-[-0.03em]"
        >
          {copy.heading}
        </h1>
        <p className="text-muted text-meta mt-1.5 font-mono tracking-wider">{code}</p>
        <p className="text-muted text-lead mt-4">{detail}</p>
        {copy.link !== null && (
          <Link
            href={copy.link.href}
            className="btn-primary mt-6 block w-full text-center"
          >
            {copy.link.label}
          </Link>
        )}
      </div>
    </div>
  );
}
