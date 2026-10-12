import { act, render, screen } from '@testing-library/react';

import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';
import { useAudioLevelStore } from '@/shared/stores/audio-level.store';

import { RemoteAudioPlayer, VideoTile } from './MeetingMedia';

const fakeAudioTrack = (id: string): MediaStreamTrack =>
  ({ kind: 'audio', id }) as unknown as MediaStreamTrack;
const fakeVideoTrack = (id: string): MediaStreamTrack =>
  ({ kind: 'video', id }) as unknown as MediaStreamTrack;

const audioEntry = (
  overrides: Partial<RemoteMediaEntry> & Pick<RemoteMediaEntry, 'consumerId' | 'peerId'>,
): RemoteMediaEntry => ({
  producerId: `p-${overrides.consumerId}`,
  kind: 'audio',
  source: 'audio',
  track: fakeAudioTrack(overrides.consumerId),
  ...overrides,
});

const videoEntry = (
  overrides: Partial<RemoteMediaEntry> & Pick<RemoteMediaEntry, 'consumerId' | 'peerId'>,
): RemoteMediaEntry => ({
  producerId: `p-${overrides.consumerId}`,
  kind: 'video',
  source: 'video',
  track: fakeVideoTrack(overrides.consumerId),
  ...overrides,
});

describe('RemoteAudioPlayer', () => {
  it('remoteMedia가 비어 있으면 audio 요소가 0 개', () => {
    const { container } = render(<RemoteAudioPlayer remoteMedia={[]} />);
    expect(container.querySelectorAll('audio')).toHaveLength(0);
  });

  it('audio 항목만 audio element로 렌더된다 (video는 무시)', () => {
    const remoteMedia: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerId: 's1' }),
      videoEntry({ consumerId: 'cv1', peerId: 's1' }),
      audioEntry({ consumerId: 'ca2', peerId: 's2' }),
    ];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    expect(container.querySelectorAll('audio')).toHaveLength(2);
  });

  it('각 audio element의 srcObject가 해당 track을 담고 있다', () => {
    const t1 = fakeAudioTrack('ca1');
    const t2 = fakeAudioTrack('ca2');
    const remoteMedia: RemoteMediaEntry[] = [
      { ...audioEntry({ consumerId: 'ca1', peerId: 's1' }), track: t1 },
      { ...audioEntry({ consumerId: 'ca2', peerId: 's2' }), track: t2 },
    ];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    const audios = container.querySelectorAll('audio');
    expect(audios).toHaveLength(2);
    const streams = Array.from(audios).map((a) => a.srcObject as MediaStream);
    const allTracks = streams.flatMap((s) => s.getAudioTracks());
    expect(allTracks).toContain(t1);
    expect(allTracks).toContain(t2);
  });

  it('audio entry가 추가되면 새 audio element가 늘어난다 (rerender)', () => {
    const remoteMedia0: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerId: 's1' }),
    ];
    const { container, rerender } = render(<RemoteAudioPlayer remoteMedia={remoteMedia0} />);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    rerender(
      <RemoteAudioPlayer
        remoteMedia={[...remoteMedia0, audioEntry({ consumerId: 'ca2', peerId: 's2' })]}
      />,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(2);
  });

  it('audio entry가 제거되면 해당 audio element가 사라진다', () => {
    const initial: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerId: 's1' }),
      audioEntry({ consumerId: 'ca2', peerId: 's2' }),
    ];
    const { container, rerender } = render(<RemoteAudioPlayer remoteMedia={initial} />);
    expect(container.querySelectorAll('audio')).toHaveLength(2);
    rerender(<RemoteAudioPlayer remoteMedia={[initial[0]]} />);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
  });

  it('audio element는 화면에 보이지 않게 aria-hidden으로 처리된다', () => {
    const remoteMedia: RemoteMediaEntry[] = [audioEntry({ consumerId: 'ca1', peerId: 's1' })];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    // 컨테이너 또는 audio 요소가 aria-hidden 이어야 한다(접근성 + 시각적 노출 차단).
    const player = container.querySelector('[data-testid="remote-audio-player"]');
    expect(player).not.toBeNull();
    expect(player!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('VideoTile 손들기', () => {
  it('손을 들면 손들기 배지를 보여 준다', () => {
    const { rerender } = render(
      <VideoTile
        label="아"
        isHandRaised
      />,
    );
    expect(screen.getByRole('img', { name: '손 듦' })).toHaveTextContent('✋');
    rerender(<VideoTile label="아" />);
    expect(screen.queryByRole('img', { name: '손 듦' })).not.toBeInTheDocument();
  });
});

describe('VideoTile 음성 레벨·발화자 강조', () => {
  beforeEach(() => {
    useAudioLevelStore.getState().reset();
  });

  const publish = (level: number, isSpeaking: boolean) =>
    act(() => {
      useAudioLevelStore.getState().publish({ pa: level }, { pa: isSpeaking });
    });

  it('마이크가 켜져 있으면 자기 key의 레벨을 미터로 보여 준다', () => {
    render(
      <VideoTile
        label="아"
        audioLevelKey="pa"
      />,
    );
    publish(2, true);
    expect(screen.getByRole('meter', { name: '음성 레벨' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
  });

  it('말하는 중이면 타일을 강조하고, 멈추면 강조를 끈다', () => {
    render(
      <VideoTile
        label="아"
        audioLevelKey="pa"
      />,
    );
    publish(2, true);
    expect(screen.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'true');
    publish(0, false);
    expect(screen.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'false');
  });

  it('음소거면 미터도 강조도 없다', () => {
    render(
      <VideoTile
        label="아"
        audioLevelKey="pa"
        isAudioOff
      />,
    );
    publish(2, true);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('speaking-ring')).not.toBeInTheDocument();
  });

  it('연결이 끊긴 참가자는 미터를 보이지 않는다', () => {
    render(
      <VideoTile
        label="아"
        audioLevelKey="pa"
        isDisconnected
      />,
    );
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });
});
