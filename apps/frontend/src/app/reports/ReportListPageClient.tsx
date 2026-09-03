'use client';

import { ReportList } from '@/feature/reports/components/ReportList';
import { useReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

/**
 * `/reports`의 client wrapper.
 * `?page=` 쿼리를 읽는 ViewModel이 여기 있으므로 page.tsx의 Suspense 경계 안에서 렌더된다.
 */
export function ReportListPageClient() {
  const vm = useReportListViewModel();
  return (
    <>
      <div className="border-border flex items-baseline justify-between gap-4 border-b pb-4 md:pb-[22px]">
        <h1 className="text-text text-display font-extrabold tracking-[-0.035em]">회의록</h1>
        {vm.status === 'loaded' && vm.page.totalItems > 0 && (
          <span className="text-muted text-meta shrink-0 font-mono font-medium">
            총 {vm.page.totalItems}건
          </span>
        )}
      </div>
      <ReportList {...vm} />
    </>
  );
}
