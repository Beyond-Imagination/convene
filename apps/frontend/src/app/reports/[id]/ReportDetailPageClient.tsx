'use client';

import Link from 'next/link';

import { ReportDetail } from '@/feature/reports/components/ReportDetail';
import { useReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';
import { useRouteSegment } from '@/shared/hooks/useRouteSegment';

/**
 * `/reports/[id]`의 client wrapper.
 * URL에서 회의록 id를 읽고 ViewModel + View를 합성한다.
 */
export function ReportDetailPageClient() {
  const id = useRouteSegment('reports', 'id');
  const vm = useReportDetailViewModel(id);
  return (
    <main className="bg-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-6">
          <Link
            href="/reports"
            className="text-muted hover:text-accent text-sm font-medium transition-colors"
          >
            ← 회의록 목록
          </Link>
        </nav>
        <ReportDetail {...vm} />
      </div>
    </main>
  );
}
