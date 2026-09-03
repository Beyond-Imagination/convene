'use client';

import type { PageMetaWire } from '@convene/shared-interfaces';
import Link from 'next/link';

import type { UseReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

export type ReportListProps = UseReportListViewModel;

/** 한 번에 노출할 페이지 번호 개수. */
const PAGE_WINDOW = 5;

const STEP_BUTTON_CLASS =
  'text-muted text-meta hover:bg-text/5 hover:text-text rounded-lg px-3 py-2 font-mono font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

/** 현재 페이지를 가운데 두되 양 끝에서는 목록 안쪽으로 밀어 넣는다. */
function pageWindow(current: number, totalPages: number): number[] {
  const from = Math.max(
    1,
    Math.min(current - Math.floor(PAGE_WINDOW / 2), totalPages - PAGE_WINDOW + 1),
  );
  const to = Math.min(totalPages, from + PAGE_WINDOW - 1);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

interface PagerProps {
  readonly page: PageMetaWire;
  readonly goToPage: (page: number) => void;
}

function Pager({ page, goToPage }: PagerProps) {
  return (
    <nav
      aria-label="회의록 페이지"
      className="flex items-center justify-center gap-1.5 pt-8 md:pt-10"
    >
      <button
        type="button"
        data-testid="report-page-prev"
        disabled={page.number <= 1}
        onClick={() => goToPage(page.number - 1)}
        className={STEP_BUTTON_CLASS}
      >
        이전
      </button>
      {pageWindow(page.number, page.totalPages).map((number) => (
        <button
          key={number}
          type="button"
          aria-current={number === page.number ? 'page' : undefined}
          onClick={() => goToPage(number)}
          className={`text-meta min-w-9 rounded-lg px-3 py-2 font-mono transition-colors ${
            number === page.number
              ? 'bg-accent text-accent-fg font-bold'
              : 'text-muted hover:bg-text/5 hover:text-text font-medium'
          }`}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        data-testid="report-page-next"
        disabled={page.number >= page.totalPages}
        onClick={() => goToPage(page.number + 1)}
        className={STEP_BUTTON_CLASS}
      >
        다음
      </button>
    </nav>
  );
}

/**
 * 회의록 목록 페이지의 dumb View.
 *
 * ViewModel의 status 머신을 그대로 분기 렌더한다.
 * 각 항목은 /reports/:id로 가는 `next/link`로, 정적 export 환경에서도 client routing으로 진입한다.
 */
export function ReportList({
  status,
  items,
  page,
  errorMessage,
  refresh,
  goToPage,
}: ReportListProps) {
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
    <>
      <ul className="flex flex-col">
        {items.map((report) => (
          <li key={report.id}>
            <Link
              href={`/reports/${report.id}`}
              data-testid="report-list-item"
              className="hover:bg-text/[0.04] flex flex-col gap-2 px-4 py-5 transition-colors md:flex-row md:items-center md:gap-7 md:px-5 md:py-[26px]"
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
      {page.totalPages > 1 && (
        <Pager
          page={page}
          goToPage={goToPage}
        />
      )}
    </>
  );
}
