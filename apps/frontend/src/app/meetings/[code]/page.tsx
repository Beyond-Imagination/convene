import { MeetingPageClient } from './MeetingPageClient';

/**
 * `/meetings/[code]` 동적 라우트.
 *
 * `output: 'export'`는 dynamic route마다 `generateStaticParams`의 entry가 최소 1개 필요하므로 placeholder 1개만 빌드하고,
 * 실제 코드 경로는 SPA fallback으로 client side 라우팅이 렌더한다.
 */
export async function generateStaticParams(): Promise<Array<{ code: string }>> {
  return [{ code: 'placeholder' }];
}

export default function MeetingPage() {
  return <MeetingPageClient />;
}
