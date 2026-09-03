import { Suspense } from 'react';

import { AppHeader } from '@/shared/AppHeader';

import { ReportListPageClient } from './ReportListPageClient';

/**
 * `/reports` 회의록 목록 페이지.
 *
 * 목록 본문은 `?page=` 쿼리를 읽으므로 `useSearchParams`가 요구하는 Suspense 경계 안에 둔다.
 * 정적 export 빌드에서 데이터는 client mount 시점에 GET /reports로 가져온다.
 */
export default function ReportListPage() {
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <AppHeader current="reports" />

      <main className="px-gutter py-panel-y flex flex-1 flex-col">
        <Suspense
          fallback={
            <p
              role="status"
              aria-live="polite"
              className="text-muted text-body py-16 text-center"
            >
              불러오는 중…
            </p>
          }
        >
          <ReportListPageClient />
        </Suspense>
      </main>
    </div>
  );
}
