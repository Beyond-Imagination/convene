'use client';

import Link from 'next/link';

import type { UseReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

/**
 * 회의록 목록 페이지의 dumb View.
 *
 * ViewModel 의 status 머신을 그대로 분기 렌더한다. 각 카드는 /reports/:id 로
 * 가는 `next/link` — CloudFront SPA fallback(/404 → /index.html) 으로 정적
 * export 환경에서도 client routing 으로 진입한다.
 */
export type ReportListProps = UseReportListViewModel;

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export function ReportList({ status, items, errorMessage, refresh }: ReportListProps) {
  if (status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="py-12 text-center text-muted">
        불러오는 중…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <section className="rounded-xl border border-border bg-surface p-6 text-center">
        <p role="alert" className="text-sm text-danger">
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
        className="rounded-xl border border-dashed border-border bg-surface py-16 text-center text-muted"
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
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-bg"
          >
            <span className="text-base font-semibold text-text">
              {report.title ?? '(제목 없음)'}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="rounded bg-bg px-2 py-0.5 font-medium">
                코드 {report.code}
              </span>
              <span>참가자 {report.participantCount}명</span>
              <span>{formatDate(report.endedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
