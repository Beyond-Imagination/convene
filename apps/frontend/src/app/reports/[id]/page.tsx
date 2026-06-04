import { ReportDetailPageClient } from './ReportDetailPageClient';

/**
 * `/reports/[id]` 동적 라우트.
 *
 * `output: 'export'` 는 dynamic route 마다 `generateStaticParams` 의 entry 가
 * 최소 1개 필요하므로 placeholder 1개만 빌드하고, 실제 id 경로는 SPA fallback
 * 으로 client side 라우팅이 렌더한다.
 */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [{ id: 'placeholder' }];
}

export default function ReportDetailPage() {
  return <ReportDetailPageClient />;
}
