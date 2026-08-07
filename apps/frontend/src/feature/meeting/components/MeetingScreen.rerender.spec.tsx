import { act, render } from '@testing-library/react';
import { useState } from 'react';

import { ChatPanel } from '@/feature/meeting/components/ChatPanel';
import type { ChatMessageView } from '@/feature/meeting/hooks/useChatViewModel';
import { MeetingScreen } from '@/feature/meeting/components/MeetingScreen';
import type {
  RemoteMediaEntry,
  UseMediasoupViewModel,
} from '@/feature/meeting/hooks/useMediasoupViewModel';
import type {
  RemoteParticipant,
  UseMeetingViewModel,
} from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * VideoTile 이 실제로 몇 번 렌더되는지 세기 위해 원본을 감싼다.
 * 실제 구현을 그대로 호출하므로 렌더 결과와 DOM 은 프로덕션과 동일하다.
 */
const videoTileRenders = vi.fn();
vi.mock('@/feature/meeting/components/MeetingMedia', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/feature/meeting/components/MeetingMedia')>();
  return {
    ...actual,
    VideoTile: (props: Parameters<typeof actual.VideoTile>[0]) => {
      videoTileRenders(props.label);
      return actual.VideoTile(props);
    },
  };
});

const fakeTrack = (kind: 'audio' | 'video'): MediaStreamTrack =>
  ({ kind }) as unknown as MediaStreamTrack;

const participants: ReadonlyArray<RemoteParticipant> = [
  { socketId: 's1', nickname: '민준', joinedAt: '2026-08-07T00:00:00.000Z' },
  { socketId: 's2', nickname: '서연', joinedAt: '2026-08-07T00:00:01.000Z' },
  { socketId: 's3', nickname: '도윤', joinedAt: '2026-08-07T00:00:02.000Z' },
];
const TILE_COUNT = 1 + participants.length;

const initialRemoteMedia: ReadonlyArray<RemoteMediaEntry> = participants.flatMap((p) => [
  {
    consumerId: `c-${p.socketId}-v`,
    peerSocketId: p.socketId,
    producerId: `p-${p.socketId}-v`,
    kind: 'video' as const,
    source: 'video' as const,
    track: fakeTrack('video'),
    paused: false,
  },
  {
    consumerId: `c-${p.socketId}-a`,
    peerSocketId: p.socketId,
    producerId: `p-${p.socketId}-a`,
    kind: 'audio' as const,
    source: 'audio' as const,
    track: fakeTrack('audio'),
    paused: false,
  },
]);

const meetingVm: UseMeetingViewModel = {
  code: 'abc-defg-hij',
  status: 'joined',
  nickname: '지현',
  remoteParticipants: participants,
  errorMessage: null,
  socket: null,
  reconnectGen: 0,
  isHost: true,
  isNavigatingAway: false,
  leave: vi.fn(),
  endMeeting: vi.fn(async () => {}),
};

/** harness 밖에서 상태를 흔들기 위한 조작 핸들. */
interface Controls {
  addMessage: (m: ChatMessageView) => void;
  toggleRemoteAudioPaused: (peerSocketId: string) => void;
  toggleMyAudio: () => void;
}

/**
 * MeetingPageClient 의 MeetingSession 과 같은 구조를 재현한다.
 * 채팅 draft·messages 가 회의 화면과 같은 컴포넌트에 있고,
 * mediasoup ViewModel 은 실제 hook 처럼 매 렌더 새 객체로 만들어진다.
 */
function MeetingSessionHarness({ onReady }: { onReady: (c: Controls) => void }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessageView>>([]);
  const [remoteMedia, setRemoteMedia] =
    useState<ReadonlyArray<RemoteMediaEntry>>(initialRemoteMedia);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  onReady({
    addMessage: (m) => setMessages((prev) => [...prev, m]),
    // useRemoteMedia 의 onProducerToggled 와 같은 갱신 방식 (배열 전체를 새로 만든다).
    toggleRemoteAudioPaused: (peerSocketId) =>
      setRemoteMedia((prev) =>
        prev.map((m) =>
          m.peerSocketId === peerSocketId && m.kind === 'audio' ? { ...m, paused: !m.paused } : m,
        ),
      ),
    toggleMyAudio: () => setIsAudioMuted((v) => !v),
  });

  // useMediasoupViewModel 은 매 렌더 새 객체를 반환한다(useMediasoupViewModel.ts:59).
  const mediasoup: UseMediasoupViewModel = {
    status: 'ready',
    errorMessage: null,
    localStream: null,
    remoteMedia,
    isSharingScreen: false,
    screenStream: null,
    isRemoteSharingScreen: false,
    isAudioMuted,
    isVideoMuted: false,
    toggleAudio: () => {},
    toggleVideo: () => {},
    startScreenShare: async () => {},
    stopScreenShare: () => {},
  };

  return (
    <div className="theme-dark flex h-screen overflow-hidden">
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoup}
        isChatOpen
        onToggleChat={() => {}}
      />
      <aside>
        <ChatPanel
          messages={messages}
          canSend
          draft={draft}
          setDraft={setDraft}
          submit={() => {}}
          myNickname={meetingVm.nickname}
        />
      </aside>
    </div>
  );
}

const typeInto = (input: HTMLInputElement, text: string): void => {
  for (const ch of text) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, input.value + ch);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
};

const renderHarness = () => {
  let controls: Controls | null = null;
  const { container } = render(
    <MeetingSessionHarness
      onReady={(c) => {
        controls = c;
      }}
    />,
  );
  const input = container.querySelector<HTMLInputElement>('#chat-input');
  if (input === null || controls === null) throw new Error('harness 준비 실패');
  return { controls: controls as Controls, input };
};

/**
 * 회의 화면은 타일 수만큼 비용이 곱해지므로, "무엇이 바뀌었을 때 몇 개가 다시 그려지는가" 를
 * 고정해 둔다. 렌더 횟수는 구현 세부지만 여기서는 그 자체가 요구사항이다.
 */
describe('회의 화면 리렌더 전파', () => {
  beforeEach(() => {
    videoTileRenders.mockClear();
  });

  it('마운트 시 타일 수만큼만 렌더한다', () => {
    renderHarness();
    expect(videoTileRenders).toHaveBeenCalledTimes(TILE_COUNT);
  });

  it('채팅 입력은 비디오 타일을 다시 그리지 않는다', () => {
    const { input } = renderHarness();
    videoTileRenders.mockClear();
    typeInto(input, '안녕하세요');
    expect(videoTileRenders).not.toHaveBeenCalled();
  });

  it('채팅 메시지 수신은 비디오 타일을 다시 그리지 않는다', () => {
    const { controls } = renderHarness();
    videoTileRenders.mockClear();
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        controls.addMessage({
          nickname: '민준',
          text: `메시지 ${i}`,
          sentAt: `2026-08-07T00:00:0${i}.000Z`,
        } as ChatMessageView);
      });
    }
    expect(videoTileRenders).not.toHaveBeenCalled();
  });

  it('원격 참가자 1명의 마이크 토글은 그 사람 타일만 다시 그린다', () => {
    const { controls } = renderHarness();
    videoTileRenders.mockClear();
    act(() => controls.toggleRemoteAudioPaused('s1'));
    expect(videoTileRenders.mock.calls.map((c) => c[0])).toEqual(['민준']);
  });

  it('내 마이크 토글은 내 타일만 다시 그린다', () => {
    const { controls } = renderHarness();
    videoTileRenders.mockClear();
    act(() => controls.toggleMyAudio());
    expect(videoTileRenders.mock.calls.map((c) => c[0])).toEqual(['지현']);
  });
});
