'use client';

import { useParams } from 'next/navigation';

/**
 * 동적 라우트 segment 값을 **브라우저 URL에서 직접** 읽는다.
 *
 * 정적 export(`output: 'export'`)의 동적 라우트는 `generateStaticParams`의 placeholder HTML 한 장만 빌드되어,
 * 실제 코드 경로(`/meetings/{code}`) 요청에도 그 placeholder가 서빙된다.
 * 이때 `useParams()`는 URL이 아니라 **빌드 타임 값(`'placeholder'`)** 을 돌려주므로 그대로 쓰면 안 된다.
 * 따라서 클라이언트에서는 `window.location.pathname`에서 실제 값을 읽고, window가 없는 빌드/SSR/테스트 환경에서는 `useParams()`로 폴백한다.
 *
 * @param parentSegment 동적 segment 바로 앞의 고정 경로 (예: `'meetings'`, `'reports'`)
 * @param paramKey      `useParams` 폴백 시 쓸 키 (예: `'code'`, `'id'`)
 */
export function useRouteSegment(parentSegment: string, paramKey: string): string {
  const params = useParams<Record<string, string>>();

  if (typeof window !== 'undefined') {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf(parentSegment);
    if (idx >= 0 && segments[idx + 1]) {
      return decodeURIComponent(segments[idx + 1]);
    }
  }

  const fallback = params?.[paramKey];
  return typeof fallback === 'string' ? fallback : '';
}
