'use client';

import Link from 'next/link';

import { ReportList } from '@/feature/reports/components/ReportList';
import { useReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

/**
 * `/reports` 회의록 목록 페이지.
 *
 * 정적 export 빌드에서도 client mount 시점에 GET /reports 로 데이터를 가져온다
 * (ARCHITECTURE §4.3). server component 의 데이터 fetch / route handler /
 * middleware 는 사용하지 않는다.
 */
export default function ReportListPage() {
  const vm = useReportListViewModel();
  return (
    <main>
      <h1>회의록</h1>
      <ReportList {...vm} />
      <nav>
        <Link href="/">홈으로</Link>
      </nav>
    </main>
  );
}
