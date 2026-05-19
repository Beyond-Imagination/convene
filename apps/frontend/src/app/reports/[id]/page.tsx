import { ReportDetailPageClient } from './ReportDetailPageClient';

/**
 * `/reports/[id]` 동적 라우트.
 *
 * `output: 'export'` 정적 빌드는 dynamic route 마다 `generateStaticParams` 가
 * 필수이며 최소 1개의 entry 가 필요하다(빈 배열은 build 에러). 실제 회의록 id 는
 * 사전에 알 수 없으므로 placeholder 1개만 빌드해서 routing 메타데이터를 만들고,
 * 실 사용 시에는 CloudFront /404 → /index.html SPA fallback 으로 client side
 * 라우팅이 본 페이지를 렌더한다(ARCHITECTURE §4.3).
 */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [{ id: 'placeholder' }];
}

export default function ReportDetailPage() {
  return <ReportDetailPageClient />;
}
