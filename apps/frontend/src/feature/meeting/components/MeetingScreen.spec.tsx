import { fireEvent, render, screen } from '@testing-library/react';

import type {
  RemoteParticipant,
  UseMeetingViewModel,
} from '@/feature/meeting/hooks/useMeetingViewModel';
import type {
  RemoteMediaEntry,
  UseMediasoupViewModel,
} from '@/feature/meeting/hooks/useMediasoupViewModel';

import { MeetingScreen } from './MeetingScreen';

const baseMediasoup = (
  overrides: Partial<UseMediasoupViewModel> = {},
): UseMediasoupViewModel => ({
  status: 'ready',
  errorMessage: null,
  localStream: null,
  remoteMedia: [],
  isSharingScreen: false,
  screenStream: null,
  startScreenShare: vi.fn(async () => {}),
  stopScreenShare: vi.fn(),
  ...overrides,
});

const fakeTrack = (kind: 'audio' | 'video'): MediaStreamTrack =>
  ({ kind } as unknown as MediaStreamTrack);

const fakeStream = (): MediaStream => ({}) as unknown as MediaStream;

const remoteEntry = (
  overrides: Partial<RemoteMediaEntry> & Pick<RemoteMediaEntry, 'peerSocketId' | 'kind'>,
): RemoteMediaEntry => ({
  consumerId: `c-${overrides.peerSocketId}-${overrides.kind}`,
  producerId: `p-${overrides.peerSocketId}-${overrides.kind}`,
  source: overrides.kind === 'video' ? 'video' : 'audio',
  track: fakeTrack(overrides.kind),
  ...overrides,
});

const baseVm = (overrides: Partial<UseMeetingViewModel> = {}): UseMeetingViewModel => ({
  code: 'abc12xyz',
  status: 'joined',
  nickname: '준',
  remoteParticipants: [],
  errorMessage: null,
  leave: vi.fn(),
  ...overrides,
});

const renderScreen = (
  vmOverrides: Partial<UseMeetingViewModel> = {},
  mediasoupOverrides: Partial<UseMediasoupViewModel> = {},
) =>
  render(
    <MeetingScreen {...baseVm(vmOverrides)} mediasoup={baseMediasoup(mediasoupOverrides)} />,
  );

describe('MeetingScreen View', () => {
  it('회의 코드와 내 닉네임을 헤더에 노출한다', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /abc12xyz/ })).toBeInTheDocument();
    expect(screen.getByText(/내 닉네임: 준/)).toBeInTheDocument();
  });

  it('나(self) 참가자는 항상 한 줄로 표시된다', () => {
    renderScreen();
    expect(screen.getByTestId('self-participant')).toHaveTextContent('준 (나)');
  });

  it('원격 참가자 목록을 socketId 순서대로 렌더한다', () => {
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
      { socketId: 's3', nickname: '벤', joinedAt: '2026-01-01T00:02:00.000Z' },
    ];
    renderScreen({ remoteParticipants });
    const items = screen.getAllByTestId('remote-participant');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('아');
    expect(items[1]).toHaveTextContent('벤');
  });

  it('status="connecting" 이면 role="status" 로 안내 메시지', () => {
    renderScreen({ status: 'connecting' });
    expect(screen.getByRole('status')).toHaveTextContent('연결 중');
  });

  it('status="error" + errorMessage 가 있으면 alert 로 노출', () => {
    renderScreen({ status: 'error', errorMessage: 'handshake 실패' });
    expect(screen.getByRole('alert')).toHaveTextContent('handshake 실패');
  });

  it('나가기 버튼 클릭 시 vm.leave 가 호출된다', () => {
    const leave = vi.fn();
    renderScreen({ leave });
    fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('mediasoup.status="preparing" 이면 미디어 준비 중 안내가 노출된다', () => {
    renderScreen({}, { status: 'preparing' });
    expect(screen.getByTestId('mediasoup-status')).toHaveTextContent('미디어 준비 중');
  });

  it('mediasoup.status="ready" 이면 준비 중 안내가 사라진다', () => {
    renderScreen({}, { status: 'ready' });
    expect(screen.queryByTestId('mediasoup-status')).toBeNull();
  });

  it('mediasoup.status="error" + errorMessage 가 있으면 미디어 오류가 alert 로 노출된다', () => {
    renderScreen({}, { status: 'error', errorMessage: 'no ice' });
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.includes('미디어 오류'))).toBe(true);
    expect(alerts.some((el) => el.textContent?.includes('no ice'))).toBe(true);
  });

  it('localStream + 내 닉네임이 있으면 self video tile 이 닉네임과 함께 렌더된다', () => {
    const stream = fakeStream();
    renderScreen({ nickname: '준' }, { localStream: stream });
    const tile = screen.getByTestId('local-video-tile');
    expect(tile).toHaveTextContent('준');
    expect(tile).toHaveTextContent('(나)');
    const video = tile.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
  });

  it('localStream 이 null 이면 self video tile 의 video 는 srcObject 가 비어 있다', () => {
    renderScreen({ nickname: '준' }, { localStream: null });
    const tile = screen.getByTestId('local-video-tile');
    const video = tile.querySelector('video') as HTMLVideoElement;
    expect(video.srcObject).toBeNull();
  });

  it('각 remoteParticipant 에 대해 remote video tile 이 닉네임과 함께 렌더된다', () => {
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
      { socketId: 's3', nickname: '벤', joinedAt: '2026-01-01T00:02:00.000Z' },
    ];
    renderScreen(
      { remoteParticipants },
      { remoteMedia: [remoteEntry({ peerSocketId: 's2', kind: 'video' })] },
    );
    const tiles = screen.getAllByTestId('remote-video-tile');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveTextContent('아');
    expect(tiles[1]).toHaveTextContent('벤');
  });

  it('peerSocketId 와 매칭되는 video track 의 srcObject 가 video 요소에 attach 된다', () => {
    const track = fakeTrack('video');
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
    ];
    renderScreen(
      { remoteParticipants },
      {
        remoteMedia: [
          { ...remoteEntry({ peerSocketId: 's2', kind: 'video' }), track },
        ],
      },
    );
    const tile = screen.getByTestId('remote-video-tile');
    const video = tile.querySelector('video') as HTMLVideoElement;
    expect(video.srcObject).not.toBeNull();
    const stream = video.srcObject as MediaStream;
    expect(stream.getVideoTracks()).toContain(track);
  });

  it('매칭되는 audio track 이 있으면 audio 요소가 함께 attach 된다', () => {
    const audioTrack = fakeTrack('audio');
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
    ];
    renderScreen(
      { remoteParticipants },
      {
        remoteMedia: [
          { ...remoteEntry({ peerSocketId: 's2', kind: 'audio' }), track: audioTrack },
        ],
      },
    );
    const tile = screen.getByTestId('remote-video-tile');
    const audio = tile.querySelector('audio') as HTMLAudioElement;
    expect(audio).not.toBeNull();
    expect(audio.srcObject).not.toBeNull();
    expect((audio.srcObject as MediaStream).getAudioTracks()).toContain(audioTrack);
  });

  it('isSharingScreen=false 면 "화면 공유 시작" 버튼이 노출되고 클릭 시 startScreenShare 호출', () => {
    const startScreenShare = vi.fn(async () => {});
    renderScreen({}, { isSharingScreen: false, startScreenShare });
    const button = screen.getByRole('button', { name: '화면 공유 시작' });
    fireEvent.click(button);
    expect(startScreenShare).toHaveBeenCalledTimes(1);
  });

  it('isSharingScreen=true 면 "공유 중지" 버튼 + screen 비디오 타일이 노출된다', () => {
    const stopScreenShare = vi.fn();
    const stream = fakeStream();
    renderScreen({}, { isSharingScreen: true, screenStream: stream, stopScreenShare });
    fireEvent.click(screen.getByRole('button', { name: '공유 중지' }));
    expect(stopScreenShare).toHaveBeenCalledTimes(1);
    const tile = screen.getByTestId('local-screen-tile');
    const video = tile.querySelector('video') as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
  });

  it('원격 참가자의 source=screen 트랙이 있으면 별도 remote-screen-tile 이 노출된다', () => {
    const screenTrack = fakeTrack('video');
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
    ];
    renderScreen(
      { remoteParticipants },
      {
        remoteMedia: [
          {
            ...remoteEntry({ peerSocketId: 's2', kind: 'video' }),
            source: 'screen',
            track: screenTrack,
          },
        ],
      },
    );
    const tile = screen.getByTestId('remote-screen-tile');
    expect(tile).toHaveTextContent('아');
    const video = tile.querySelector('video') as HTMLVideoElement;
    expect((video.srcObject as MediaStream).getVideoTracks()).toContain(screenTrack);
  });
});
