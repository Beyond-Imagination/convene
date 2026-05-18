'use client';

import { useParams } from 'next/navigation';

import { MeetingScreen } from '@/feature/meeting/components/MeetingScreen';
import { useMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * `/meetings/[code]` 의 client wrapper.
 *
 * `useParams` 로 동적 segment 를 읽고 ViewModel hook 에 위임한다. server page
 * (`page.tsx`)와 분리한 이유는 정적 export 의 `generateStaticParams` 와 client hook
 * 사용이 동일 파일에서 공존할 수 없기 때문이다.
 */
export function MeetingPageClient() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const vm = useMeetingViewModel(code);
  return <MeetingScreen {...vm} />;
}
