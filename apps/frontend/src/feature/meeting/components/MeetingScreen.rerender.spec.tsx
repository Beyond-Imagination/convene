import { type ChatPostedBroadcast, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { act, render, screen } from '@testing-library/react';
import { memo, type ReactNode, useEffect } from 'react';
import type { Socket } from 'socket.io-client';

import { MeetingPageClient } from '@/app/meetings/[code]/MeetingPageClient';
import type { VideoTileProps } from '@/feature/meeting/components/MeetingMedia';
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
 * VideoTile 의 렌더 함수가 몇 번 불리는지 센다.
 *
 * 원본이 memo 로 감싸져 있으면 래퍼도 같은 memo 로 감싸고 카운터는 그 **안쪽**에 둔다.
 * 그래야 "memo 가 걸려 있어서 렌더를 건너뛰었다" 를 그대로 관찰한다. 래퍼를 무조건
 * memo 로 감싸면 프로덕션에 memo 가 없어도 통과해 버리고, 무조건 안 감싸면 프로덕션의
 * memo 가 무력화되어 둘 다 측정이 거짓이 된다.
 */
const videoTileRenders = vi.fn();
/**
 * 미디어 요소 재바인딩(= `<video>` 의 srcObject 재설정) 횟수. 렌더 횟수보다 이쪽이 실제 부하다.
 * 재바인딩이 일어나면 그 순간 영상이 끊긴다. 원본 훅과 같은 deps 를 걸어 같은 시점에 재실행된다.
 */
const mediaRebinds = vi.fn();
vi.mock('@/feature/meeting/hooks/useMediaElementBinding', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/feature/meeting/hooks/useMediaElementBinding')>();
  return {
    useMediaElementBinding: (params: Parameters<typeof actual.useMediaElementBinding>[0]) => {
      useEffect(() => {
        if (params.stream !== null) mediaRebinds();
      }, [params.ref, params.stream, params.enabled]);
      return actual.useMediaElementBinding(params);
    },
  };
});

vi.mock('@/feature/meeting/components/MeetingMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/feature/meeting/components/MeetingMedia')>();
  const original = actual.VideoTile as unknown as
    | ((props: VideoTileProps) => ReactNode)
    | { $$typeof: symbol; type: (props: VideoTileProps) => ReactNode; compare?: unknown };
  const isMemo = typeof original === 'object' && original.$$typeof === Symbol.for('react.memo');
  const renderFn = isMemo ? original.type : (original as (props: VideoTileProps) => ReactNode);
  const counted = (props: VideoTileProps): ReactNode => {
    videoTileRenders(props.label);
    return renderFn(props);
  };
  return { ...actual, VideoTile: isMemo ? memo(counted, original.compare as never) : counted };
});

/**
 * VideoStage 는 memo 가 없어 MeetingScreen 이 다시 그려지면 반드시 같이 불린다.
 * VideoTile 카운터는 memo 에 가려지므로, 상위가 다시 그려졌는지는 이쪽으로 본다.
 */
const videoStageRenders = vi.fn();
vi.mock('@/feature/meeting/components/VideoStage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/feature/meeting/components/VideoStage')>();
  return {
    ...actual,
    VideoStage: (props: Parameters<typeof actual.VideoStage>[0]) => {
      videoStageRenders();
      return actual.VideoStage(props);
    },
  };
});

/** ChatPanel 은 memo 가 없으므로 그대로 감싸 렌더 횟수만 센다. */
const chatPanelRenders = vi.fn();
vi.mock('@/feature/meeting/components/ChatPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/feature/meeting/components/ChatPanel')>();
  return {
    ...actual,
    ChatPanel: (props: Parameters<typeof actual.ChatPanel>[0]) => {
      chatPanelRenders();
      return actual.ChatPanel(props);
    },
  };
});

/** 경과 시간이 실제로 흐르도록 방이 열린 시각을 준다. */
vi.mock('@/feature/meeting/hooks/useMeetingCardViewModel', () => ({
  useMeetingCardViewModel: () => ({
    status: 'ready' as const,
    meeting: {
      code: 'abc-defg-hij',
      title: null,
      status: 'open' as const,
      participantCount: 4,
      startedAt: '2026-08-07T00:00:00.000Z',
      endedAt: null,
    },
  }),
}));

const fakeTrack = (kind: 'audio' | 'video'): MediaStreamTrack =>
  ({ kind }) as unknown as MediaStreamTrack;

const participants: ReadonlyArray<RemoteParticipant> = [
  {
    participantId: 's1',
    nickname: '민준',
    joinedAt: '2026-08-07T00:00:00.000Z',
    disconnected: false,
  },
  {
    participantId: 's2',
    nickname: '서연',
    joinedAt: '2026-08-07T00:00:01.000Z',
    disconnected: false,
  },
  {
    participantId: 's3',
    nickname: '도윤',
    joinedAt: '2026-08-07T00:00:02.000Z',
    disconnected: false,
  },
];
const TILE_COUNT = 1 + participants.length;

const remoteMedia: ReadonlyArray<RemoteMediaEntry> = participants.flatMap((p) => [
  {
    consumerId: `c-${p.participantId}-v`,
    peerId: p.participantId,
    producerId: `p-${p.participantId}-v`,
    kind: 'video' as const,
    source: 'video' as const,
    track: fakeTrack('video'),
    paused: false,
  },
  {
    consumerId: `c-${p.participantId}-a`,
    peerId: p.participantId,
    producerId: `p-${p.participantId}-a`,
    kind: 'audio' as const,
    source: 'audio' as const,
    track: fakeTrack('audio'),
    paused: false,
  },
]);

/** 실제 useMediasoupViewModel 과 같이 호출할 때마다 새 객체를 만든다. */
const mediasoupVm = (overrides: Partial<UseMediasoupViewModel> = {}): UseMediasoupViewModel => ({
  status: 'ready',
  errorMessage: null,
  localStream: null,
  remoteMedia,
  isSharingScreen: false,
  screenStream: null,
  isRemoteSharingScreen: false,
  isAudioMuted: false,
  isVideoMuted: false,
  toggleAudio: () => {},
  toggleVideo: () => {},
  startScreenShare: async () => {},
  stopScreenShare: () => {},
  ...overrides,
});

/** 회의 화면에 등록된 WS 핸들러. 테스트가 브로드캐스트를 흉내내는 통로. */
const socketHandlers = new Map<string, (payload: unknown) => void>();
const fakeSocket = {
  connected: true,
  on: (event: string, handler: (payload: unknown) => void) => {
    socketHandlers.set(event, handler);
  },
  off: (event: string) => {
    socketHandlers.delete(event);
  },
  emit: () => {},
  disconnect: () => {},
} as unknown as Socket;

const meetingVm: UseMeetingViewModel = {
  code: 'abc-defg-hij',
  status: 'joined',
  nickname: '지현',
  remoteParticipants: participants,
  errorMessage: null,
  entryBlock: null,
  socket: fakeSocket,
  rejoinGen: 0,
  isHost: true,
  isNavigatingAway: false,
  leave: vi.fn(),
  endMeeting: vi.fn(async () => {}),
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ code: 'abc-defg-hij' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/feature/meeting/hooks/useMeetingViewModel', () => ({
  useMeetingViewModel: () => meetingVm,
}));
vi.mock('@/feature/meeting/hooks/useMediasoupViewModel', () => ({
  useMediasoupViewModel: () => mediasoupVm(),
}));

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

const screenEntry: RemoteMediaEntry = {
  consumerId: 'c-s1-screen',
  peerId: 's1',
  producerId: 'p-s1-screen',
  kind: 'video',
  source: 'screen',
  track: fakeTrack('video'),
  paused: false,
};
const localStream = { id: 'local' } as unknown as MediaStream;

beforeEach(() => {
  videoTileRenders.mockClear();
  mediaRebinds.mockClear();
  chatPanelRenders.mockClear();
  videoStageRenders.mockClear();
  socketHandlers.clear();
});

/**
 * 회의 화면은 타일 수만큼 비용이 곱해진다. 채팅처럼 비디오와 무관한 상태가 타일을 건드리지
 * 않는지를, 페이지 조립(MeetingPageClient)을 실제로 렌더해서 확인한다. 조립 구조 자체가
 * 검증 대상이므로 여기서만큼은 harness 로 구조를 흉내내지 않는다.
 */
describe('채팅 상태는 비디오 트리와 끊겨 있다', () => {
  const renderPage = () => {
    const { container } = render(<MeetingPageClient />);
    const input = container.querySelector<HTMLInputElement>('#chat-input');
    if (input === null) throw new Error('채팅 입력을 찾지 못했다');
    return { input };
  };

  it('마운트 시 타일 수만큼만 렌더한다', () => {
    renderPage();
    expect(videoTileRenders).toHaveBeenCalledTimes(TILE_COUNT);
  });

  it('채팅 입력은 비디오 타일을 다시 그리지 않는다', () => {
    const { input } = renderPage();
    videoTileRenders.mockClear();
    typeInto(input, '안녕하세요');
    expect(videoTileRenders).not.toHaveBeenCalled();
  });

  it('채팅 메시지 수신은 비디오 타일을 다시 그리지 않는다', () => {
    renderPage();
    videoTileRenders.mockClear();
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        socketHandlers.get(MEETING_WS_EVENTS.CHAT_POSTED)?.({
          nickname: '민준',
          text: `메시지 ${i}`,
          sentAt: `2026-08-07T00:00:0${i}.000Z`,
        } satisfies ChatPostedBroadcast);
      });
    }
    expect(videoTileRenders).not.toHaveBeenCalled();
  });
});

/**
 * 한 참가자의 미디어 변화가 다른 사람 타일까지 다시 그리지 않는지.
 * mediasoup ViewModel 은 매 렌더 새 객체이고 remoteMedia 도 배열째 새로 만들어지므로,
 * 타일이 스스로 props 를 비교해 걸러내야 한다.
 */
describe('한 사람의 미디어 변화는 그 사람 타일만 다시 그린다', () => {
  const renderScreen = (mediasoup: UseMediasoupViewModel) =>
    render(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoup}
      />,
    );

  it('원격 참가자 1명의 마이크 토글', () => {
    const { rerender } = renderScreen(mediasoupVm());
    videoTileRenders.mockClear();

    // useRemoteMedia 의 onProducerToggled 와 같은 갱신 방식 — 배열 전체를 새로 만든다.
    const toggled = remoteMedia.map((m) =>
      m.peerId === 's1' && m.kind === 'audio' ? { ...m, paused: true } : m,
    );
    rerender(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm({ remoteMedia: toggled })}
      />,
    );

    expect(videoTileRenders.mock.calls.map((c) => c[0])).toEqual(['민준']);
  });

  it('내 마이크 토글', () => {
    const { rerender } = renderScreen(mediasoupVm());
    videoTileRenders.mockClear();

    rerender(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm({ isAudioMuted: true })}
      />,
    );

    expect(videoTileRenders.mock.calls.map((c) => c[0])).toEqual(['지현']);
  });
});

/**
 * 화면 공유는 비디오 영역을 그리드 ↔ (공유 stage + 가로 strip) 으로 바꾼다.
 * 이때 참가자 타일이 DOM 에서 언마운트/재마운트되면 `<video>` 가 새로 만들어지면서
 * srcObject 가 다시 붙고, 그 순간 모든 참가자 영상이 끊긴다. 배치만 바뀌어야 한다.
 */
describe('화면 공유 전환이 참가자 영상을 끊지 않는다', () => {
  const renderScreen = (mediasoup: UseMediasoupViewModel) =>
    render(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoup}
      />,
    );

  it('원격 화면 공유가 시작돼도 참가자 타일은 다시 붙이지 않는다', () => {
    const { rerender } = renderScreen(mediasoupVm({ localStream }));
    videoTileRenders.mockClear();
    mediaRebinds.mockClear();

    rerender(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm({
          localStream,
          remoteMedia: [...remoteMedia, screenEntry],
          isRemoteSharingScreen: true,
        })}
      />,
    );

    // 새로 생긴 공유 화면 하나만 붙는다.
    expect(mediaRebinds).toHaveBeenCalledTimes(1);
    expect(videoTileRenders).not.toHaveBeenCalled();
  });

  it('원격 화면 공유가 끝나도 참가자 타일은 다시 붙이지 않는다', () => {
    const { rerender } = renderScreen(
      mediasoupVm({
        localStream,
        remoteMedia: [...remoteMedia, screenEntry],
        isRemoteSharingScreen: true,
      }),
    );
    videoTileRenders.mockClear();
    mediaRebinds.mockClear();

    rerender(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm({ localStream })}
      />,
    );

    expect(mediaRebinds).not.toHaveBeenCalled();
    expect(videoTileRenders).not.toHaveBeenCalled();
  });

  it('내가 화면 공유를 시작해도 참가자 타일은 다시 붙이지 않는다', () => {
    const { rerender } = renderScreen(mediasoupVm({ localStream }));
    videoTileRenders.mockClear();
    mediaRebinds.mockClear();

    rerender(
      <MeetingScreen
        {...meetingVm}
        mediasoup={mediasoupVm({
          localStream,
          isSharingScreen: true,
          screenStream: { id: 'screen' } as unknown as MediaStream,
        })}
      />,
    );

    expect(mediaRebinds).toHaveBeenCalledTimes(1);
    expect(videoTileRenders).not.toHaveBeenCalled();
  });
});

/**
 * 헤더의 경과 시간은 1초마다 바뀐다. 그 틱이 형제 트리로 새어 나가면
 * 비디오 타일과 채팅이 매초 다시 그려진다.
 */
describe('경과 시간 틱은 형제 트리로 새지 않는다', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const clock = (): string | null => screen.getByText(/^\d+:\d{2}:\d{2}$/).textContent;

  it('1초 틱 3회는 비디오 타일도 채팅 패널도 다시 그리지 않는다', () => {
    render(<MeetingPageClient />);
    const before = clock();
    videoTileRenders.mockClear();
    chatPanelRenders.mockClear();
    videoStageRenders.mockClear();

    act(() => vi.advanceTimersByTime(3000));

    // 시계가 실제로 움직였는지 먼저 본다. 안 움직이면 아래 단언은 공짜로 통과한다.
    expect(clock()).not.toBe(before);
    expect(videoStageRenders).not.toHaveBeenCalled();
    expect(videoTileRenders).not.toHaveBeenCalled();
    expect(chatPanelRenders).not.toHaveBeenCalled();
  });
});
