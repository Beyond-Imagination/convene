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
 * 각 카드는 /reports/:id로 가는 `next/link`로, 정적 export 환경에서도 client routing으로 진입한다.
 */
export function ReportList({ status, items, errorMessage, refresh }: ReportListProps) {
  if (status === 'loading') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted py-12 text-center"
      >
        불러오는 중…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <section className="border-border bg-surface rounded-xl border p-6 text-center">
        <p
          role="alert"
          className="text-danger text-sm"
        >
          {errorMessage ?? '오류가 발생했습니다.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="btn-ghost mt-4"
        >
          다시 시도
        </button>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <p
        data-testid="report-list-empty"
        className="border-border bg-surface text-muted rounded-xl border border-dashed py-16 text-center"
      >
        아직 회의록이 없습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((report) => (
        <li key={report.id}>
          <Link
            href={`/reports/${report.id}`}
            data-testid="report-list-item"
            className="border-border bg-surface hover:border-accent hover:bg-bg flex flex-col gap-1 rounded-xl border p-4 transition-colors"
          >
            <span className="text-text text-base font-semibold">
              {report.title ?? '(제목 없음)'}
            </span>
            <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="bg-bg rounded px-2 py-0.5 font-medium">코드 {report.code}</span>
              <span>참가자 {report.participantCount}명</span>
              <span>{formatDate(report.endedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
