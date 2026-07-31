'use client';

import { ChatPanel } from '@/feature/meeting/components/ChatPanel';
import { EmbedGate } from '@/feature/meeting/components/EmbedGate';
import { MeetingScreen } from '@/feature/meeting/components/MeetingScreen';
import { NicknameGate } from '@/feature/meeting/components/NicknameGate';
import { useChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';
import { useEmbedGateViewModel } from '@/feature/meeting/hooks/useEmbedGateViewModel';
import { useMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import { useMeetingCardViewModel } from '@/feature/meeting/hooks/useMeetingCardViewModel';
import { useMeetingLayoutViewModel } from '@/feature/meeting/hooks/useMeetingLayoutViewModel';
import { useMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';
import { useNicknameGateViewModel } from '@/feature/meeting/hooks/useNicknameGateViewModel';
import { useRouteSegment } from '@/shared/hooks/useRouteSegment';

/**
 * 실제 회의 세션. 세 ViewModel hook을 합성한다:
 *   - `useMeetingViewModel`
 *   - `useMediasoupViewModel`
 *   - `useChatViewModel`
 */
function MeetingSession({ code }: { readonly code: string }) {
  const meetingVm = useMeetingViewModel(code);
  // 예약 회의는 join이 처리되는 순간 방이 열린다. 입장이 확인되기 전에는 socket을 넘기지 않아
  // 미디어 협상이 방보다 먼저 도착하는 것을 막는다.
  const mediasoupVm = useMediasoupViewModel(
    meetingVm.status === 'joined' ? meetingVm.socket : null,
    code,
  );
  const chatVm = useChatViewModel(meetingVm.socket, code);
  // self 타일(항상 1) + 원격 참가자 수 = 전체 비디오 타일 수.
  const totalTiles = 1 + meetingVm.remoteParticipants.length;
  const layout = useMeetingLayoutViewModel(totalTiles);
  const gateVm = useNicknameGateViewModel();

  // 닉네임이 없는 두 경우를 구분한다:
  //  - 회의 종료 후 이동 중(isNavigatingAway): 화면을 그리지 않아 "(미인증)" 깜박임 방지.
  //  - 링크로 직접 접속(미인증): 닉네임 입력 모달을 띄워 그 자리에서 입장하게 한다.
  if (meetingVm.nickname === null) {
    if (meetingVm.isNavigatingAway) return null;
    return (
      <NicknameGate
        code={code}
        {...gateVm}
      />
    );
  }

  return (
    <div className="theme-dark bg-bg text-text flex h-screen overflow-hidden">
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
        <aside className="border-border bg-surface flex w-80 shrink-0 flex-col border-l">
          <ChatPanel
            {...chatVm}
            myNickname={meetingVm.nickname}
          />
        </aside>
      )}
    </div>
  );
}

/** 임베드 진입 카드. 회의에 들어가지 않고 상태만 조회해 보여준다. */
function EmbedGateSection({ code, pageUrl }: { readonly code: string; readonly pageUrl: string }) {
  const card = useMeetingCardViewModel(code);
  return (
    <EmbedGate
      code={code}
      pageUrl={pageUrl}
      status={card.status}
      meeting={card.meeting}
    />
  );
}

/**
 * `/meetings/[code]`의 client wrapper.
 *
 * URL에서 회의 코드를 읽고, 임베드 여부에 따라 회의 세션과 진입 카드를 가른다.
 * 임베드 판정 전에 세션을 마운트하면 소켓·미디어가 붙었다가 곧바로 정리되므로
 * 판정이 끝난 뒤에만 `MeetingSession`을 그린다.
 */
export function MeetingPageClient() {
  const code = useRouteSegment('meetings', 'code');
  const embed = useEmbedGateViewModel();

  if (embed.status === 'checking') return null;
  if (embed.status === 'embedded') {
    return (
      <EmbedGateSection
        code={code}
        pageUrl={embed.pageUrl}
      />
    );
  }
  return <MeetingSession code={code} />;
}
