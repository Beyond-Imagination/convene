'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ReportDetail } from '@/feature/reports/components/ReportDetail';
import { useReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

/**
 * `/reports/[id]` 의 client wrapper.
 * useParams 로 dynamic segment 를 읽고 ViewModel + View 를 합성한다.
 */
export function ReportDetailPageClient() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const vm = useReportDetailViewModel(id);
  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-6">
          <Link
            href="/reports"
            className="text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            ← 회의록 목록
          </Link>
        </nav>
        <ReportDetail {...vm} />
      </div>
    </main>
  );
}
