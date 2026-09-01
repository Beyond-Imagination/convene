'use client';

import type { ChatPostedBroadcast } from '@convene/shared-interfaces';
import type { Socket } from 'socket.io-client';

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
 * 채팅 ViewModel 을 회의 화면과 같은 컴포넌트에 두면 draft 한 글자마다 비디오 타일 전체가
 * 다시 그려진다(참가자 수만큼 곱해진다). 채팅 상태를 이 경계 안에 가둬 비디오 트리와 끊는다.
 * — `MeetingScreen.rerender.spec.tsx`
 */
function ChatSection({
  socket,
  code,
  myNickname,
  history,
  onClose,
}: {
  readonly socket: Socket | null;
  readonly code: string;
  readonly myNickname: string | null;
  readonly history: ReadonlyArray<ChatPostedBroadcast>;
  readonly onClose: () => void;
}) {
  const chatVm = useChatViewModel(socket, code, history);
  return (
    <ChatPanel
      {...chatVm}
      myNickname={myNickname}
      onClose={onClose}
    />
  );
}

/**
 * 실제 회의 세션. 두 ViewModel hook을 합성한다:
 *   - `useMeetingViewModel`
 *   - `useMediasoupViewModel`
 *
 * 채팅은 `ChatSection` 이 자기 ViewModel 을 직접 들고 있다(위 주석 참조).
 */
function MeetingSession({ code }: { readonly code: string }) {
  const meetingVm = useMeetingViewModel(code);
  // 예약 회의는 join이 처리되는 순간 방이 열린다. 입장이 확인되기 전에는 socket을 넘기지 않아
  // 미디어 협상이 방보다 먼저 도착하는 것을 막는다.
  // 재연결 중에도 socket을 유지해야 살아 있는 transport를 버리지 않고 복귀할 수 있다.
  const mediasoupVm = useMediasoupViewModel(
    meetingVm.status === 'joined' || meetingVm.status === 'reconnecting' ? meetingVm.socket : null,
    code,
    meetingVm.rejoinGen,
    meetingVm.rejoinPreservedMedia,
  );
  // self 타일(항상 1) + 원격 참가자 수 = 전체 비디오 타일 수.
  const totalTiles = 1 + meetingVm.remoteParticipants.length;
  const layout = useMeetingLayoutViewModel(totalTiles);
  // 제목과 방이 열린 시각은 소켓 ack에 실려 오지 않아 회의 정보를 따로 읽는다.
  const card = useMeetingCardViewModel(code);
  const gateVm = useNicknameGateViewModel(code);

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
    <div className="bg-bg text-text flex h-screen overflow-hidden">
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm}
        title={card.meeting?.title ?? null}
        startedAt={card.meeting?.startedAt ?? null}
        isChatOpen={layout.isChatOpen}
        onToggleChat={layout.toggleChat}
        variant={layout.variant}
        isStripOpen={layout.isStripOpen}
        onToggleStrip={layout.toggleStrip}
        page={layout.page}
        pageSize={layout.pageSize}
        pageCount={layout.pageCount}
        canPrev={layout.canPrev}
        canNext={layout.canNext}
        onPrevPage={layout.prevPage}
        onNextPage={layout.nextPage}
      />
      {/* 닫아도 unmount 하지 않는다 — 안 그러면 채팅 기록이 사라지고 그 동안의 메시지도 놓친다. */}
      <aside
        className={`border-border bg-paper fixed inset-0 z-20 flex-col border-l md:static md:z-auto md:w-[clamp(18rem,24vw,25rem)] md:shrink-0 md:pl-7 md:pr-8 ${
          layout.isChatOpen ? 'flex' : 'hidden'
        }`}
      >
        <ChatSection
          socket={meetingVm.socket}
          code={code}
          myNickname={meetingVm.nickname}
          history={meetingVm.chatHistory}
          onClose={layout.toggleChat}
        />
      </aside>
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
