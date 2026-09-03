'use client';

import Link from 'next/link';

import type { UseReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

export type ReportListProps = UseReportListViewModel;

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

/**
 * 회의록 목록 페이지의 dumb View.
 *
 * ViewModel의 status 머신을 그대로 분기 렌더한다.
 * 각 항목은 /reports/:id로 가는 `next/link`로, 정적 export 환경에서도 client routing으로 진입한다.
 */
export function ReportList({ status, items, errorMessage, refresh }: ReportListProps) {
  if (status === 'loading') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted text-body py-16 text-center"
      >
        불러오는 중…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-5 py-16">
        <p
          role="alert"
          className="text-danger-on text-body"
        >
          {errorMessage ?? '회의록을 불러오지 못했습니다.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="btn-ghost"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p
        data-testid="report-list-empty"
        className="text-muted text-body py-20 text-center"
      >
        아직 회의록이 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((report) => (
        <li key={report.id}>
          <Link
            href={`/reports/${report.id}`}
            data-testid="report-list-item"
            className="border-border hover:bg-text/[0.04] flex flex-col gap-2 border-b py-5 transition-colors md:flex-row md:items-center md:gap-7 md:py-[26px]"
          >
            <div className="min-w-0 flex-1">
              <div
                className={`text-title font-bold tracking-[-0.02em] ${
                  report.title === null ? 'text-muted' : 'text-text'
                }`}
              >
                {report.title ?? '(제목 없음)'}
              </div>
              <div className="text-muted text-meta mt-2 font-mono font-medium">
                코드 {report.code} · 참가자 {report.participantCount}명
              </div>
            </div>
            {report.notionSynced && (
              <span className="text-accent-on text-cap shrink-0 font-mono font-semibold tracking-[0.08em]">
                NOTION 동기화됨
              </span>
            )}
            <span className="text-muted text-meta shrink-0 font-mono font-medium md:min-w-[230px] md:text-right">
              {formatDate(report.endedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
