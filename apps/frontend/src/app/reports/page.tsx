'use client';

import Link from 'next/link';

import { ReportList } from '@/feature/reports/components/ReportList';
import { useReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

/**
 * `/reports` 회의록 목록 페이지.
 *
 * 정적 export 빌드에서도 client mount 시점에 GET /reports 로 데이터를 가져온다.
 * server component 의 데이터 fetch / route handler / middleware 는 사용하지 않는다.
 */
export default function ReportListPage() {
  const vm = useReportListViewModel();
  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-text">회의록</h1>
          <Link
            href="/"
            className="text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            ← 홈으로
          </Link>
        </header>
        <ReportList {...vm} />
      </div>
    </main>
  );
}
