'use client';

import { useParams } from 'next/navigation';

import { ChatPanel } from '@/feature/meeting/components/ChatPanel';
import { MeetingScreen } from '@/feature/meeting/components/MeetingScreen';
import { useChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';
import { useMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import { useMeetingLayoutViewModel } from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import { useMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * `/meetings/[code]` 의 client wrapper.
 *
 * `useParams` 로 동적 segment 를 읽고 세 ViewModel hook 을 합성한다:
 *   - `useMeetingViewModel` 이 socket 을 만들고 join/참가자 목록 담당
 *   - `useMediasoupViewModel` 이 그 socket 위에서 RTP capabilities/Transport 준비
 *   - `useChatViewModel` 이 그 socket 을 받아 채팅 emit/수신 담당
 *
 * server page(`page.tsx`)와 분리한 이유는 정적 export 의 `generateStaticParams`
 * 와 client hook 사용이 동일 파일에서 공존할 수 없기 때문이다.
 */
export function MeetingPageClient() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const meetingVm = useMeetingViewModel(code);
  const mediasoupVm = useMediasoupViewModel(meetingVm.socket, code);
  const chatVm = useChatViewModel(meetingVm.socket, code);
  // self 타일(항상 1) + 원격 참가자 수 = 전체 비디오 타일 수.
  const totalTiles = 1 + meetingVm.remoteParticipants.length;
  const layout = useMeetingLayoutViewModel(totalTiles);
  return (
    <div className="theme-dark flex h-screen overflow-hidden bg-bg text-text">
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm}
        isChatOpen={layout.isChatOpen}
        onToggleChat={layout.toggleChat}
        page={layout.page}
        pageSize={layout.pageSize}
        pageCount={layout.pageCount}
        canPrev={layout.canPrev}
        canNext={layout.canNext}
        onPrevPage={layout.prevPage}
        onNextPage={layout.nextPage}
      />
      {layout.isChatOpen && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
          <ChatPanel {...chatVm} myNickname={meetingVm.nickname} />
        </aside>
      )}
    </div>
  );
}
