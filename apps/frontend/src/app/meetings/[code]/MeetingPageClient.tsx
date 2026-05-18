'use client';

import { useParams } from 'next/navigation';

import { ChatPanel } from '@/feature/meeting/components/ChatPanel';
import { MeetingScreen } from '@/feature/meeting/components/MeetingScreen';
import { useChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';
import { useMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * `/meetings/[code]` 의 client wrapper.
 *
 * `useParams` 로 동적 segment 를 읽고 두 ViewModel hook 을 합성한다:
 *   - `useMeetingViewModel` 이 socket 을 만들고 join/참가자 목록 담당
 *   - `useChatViewModel` 이 그 socket 을 받아 채팅 emit/수신 담당
 *
 * server page(`page.tsx`)와 분리한 이유는 정적 export 의 `generateStaticParams`
 * 와 client hook 사용이 동일 파일에서 공존할 수 없기 때문이다.
 */
export function MeetingPageClient() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const meetingVm = useMeetingViewModel(code);
  const chatVm = useChatViewModel(meetingVm.socket, code);
  return (
    <>
      <MeetingScreen {...meetingVm} />
      <ChatPanel {...chatVm} />
    </>
  );
}
