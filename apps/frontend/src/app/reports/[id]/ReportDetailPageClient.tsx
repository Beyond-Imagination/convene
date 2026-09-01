'use client';

import { ReportDetail } from '@/feature/reports/components/ReportDetail';
import { useReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';
import { AppHeader } from '@/shared/AppHeader';
import { useRouteSegment } from '@/shared/hooks/useRouteSegment';

/**
 * `/reports/[id]`의 client wrapper.
 * URL에서 회의록 id를 읽고 ViewModel + View를 합성한다.
 */
export function ReportDetailPageClient() {
  const id = useRouteSegment('reports', 'id');
  const vm = useReportDetailViewModel(id);
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <AppHeader current="reports" />

      <main className="px-gutter py-panel-y flex-1">
        <ReportDetail {...vm} />
      </main>
    </div>
  );
}
