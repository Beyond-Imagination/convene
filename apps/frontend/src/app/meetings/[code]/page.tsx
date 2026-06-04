import { MeetingPageClient } from './MeetingPageClient';

/**
 * `/meetings/[code]` 동적 라우트.
 *
 * `output: 'export'` 는 dynamic route 마다 `generateStaticParams` 의 entry 가
 * 최소 1개 필요하므로 placeholder 1개만 빌드하고, 실제 코드 경로는 SPA fallback
 * 으로 client side 라우팅이 렌더한다.
 *
 * 본 파일은 server component(=`generateStaticParams` export 가능), 실제 hook 은
 * `MeetingPageClient`('use client') 에서 쓴다.
 */
export async function generateStaticParams(): Promise<Array<{ code: string }>> {
  return [{ code: 'placeholder' }];
}

export default function MeetingPage() {
  return <MeetingPageClient />;
}
