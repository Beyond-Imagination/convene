'use client';

import { ReportList } from '@/feature/reports/components/ReportList';
import { useReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';
import { AppHeader } from '@/shared/AppHeader';

/**
 * `/reports` 회의록 목록 페이지.
 *
 * 정적 export 빌드에서도 client mount 시점에 GET /reports로 데이터를 가져온다.
 * server component의 데이터 fetch/route handler/middleware는 사용하지 않는다.
 */
export default function ReportListPage() {
  const vm = useReportListViewModel();
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <AppHeader current="reports" />

      <main className="px-gutter py-panel-y flex flex-1 flex-col">
        <div className="border-border flex items-baseline justify-between gap-4 border-b pb-4 md:pb-[22px]">
          <h1 className="text-text text-display font-extrabold tracking-[-0.035em]">회의록</h1>
          {vm.status === 'loaded' && vm.page.totalItems > 0 && (
            <span className="text-muted text-meta shrink-0 font-mono font-medium">
              {vm.page.totalItems}건
            </span>
          )}
        </div>
        <ReportList {...vm} />
      </main>
    </div>
  );
}
