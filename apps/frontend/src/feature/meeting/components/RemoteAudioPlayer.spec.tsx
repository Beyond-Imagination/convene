import { render } from '@testing-library/react';

import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useMediasoupViewModel';

import { RemoteAudioPlayer } from './RemoteAudioPlayer';

/**
 * plum `RemoteAudioPlayer.tsx` 패턴 — 원격 audio 트랙들을 video 와 분리해 별도
 * `<audio>` 요소로 재생. autoplay 정책 회피 + 본인 비디오의 mute 와 독립.
 */

const fakeAudioTrack = (id: string): MediaStreamTrack =>
  ({ kind: 'audio', id } as unknown as MediaStreamTrack);
const fakeVideoTrack = (id: string): MediaStreamTrack =>
  ({ kind: 'video', id } as unknown as MediaStreamTrack);

const audioEntry = (
  overrides: Partial<RemoteMediaEntry> & Pick<RemoteMediaEntry, 'consumerId' | 'peerSocketId'>,
): RemoteMediaEntry => ({
  producerId: `p-${overrides.consumerId}`,
  kind: 'audio',
  source: 'audio',
  track: fakeAudioTrack(overrides.consumerId),
  ...overrides,
});

const videoEntry = (
  overrides: Partial<RemoteMediaEntry> & Pick<RemoteMediaEntry, 'consumerId' | 'peerSocketId'>,
): RemoteMediaEntry => ({
  producerId: `p-${overrides.consumerId}`,
  kind: 'video',
  source: 'video',
  track: fakeVideoTrack(overrides.consumerId),
  ...overrides,
});

describe('RemoteAudioPlayer', () => {
  it('remoteMedia 가 비어 있으면 audio 요소가 0 개', () => {
    const { container } = render(<RemoteAudioPlayer remoteMedia={[]} />);
    expect(container.querySelectorAll('audio')).toHaveLength(0);
  });

  it('audio 항목만 audio element 로 렌더된다 (video 는 무시)', () => {
    const remoteMedia: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerSocketId: 's1' }),
      videoEntry({ consumerId: 'cv1', peerSocketId: 's1' }),
      audioEntry({ consumerId: 'ca2', peerSocketId: 's2' }),
    ];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    expect(container.querySelectorAll('audio')).toHaveLength(2);
  });

  it('각 audio element 의 srcObject 가 해당 track 을 담고 있다', () => {
    const t1 = fakeAudioTrack('ca1');
    const t2 = fakeAudioTrack('ca2');
    const remoteMedia: RemoteMediaEntry[] = [
      { ...audioEntry({ consumerId: 'ca1', peerSocketId: 's1' }), track: t1 },
      { ...audioEntry({ consumerId: 'ca2', peerSocketId: 's2' }), track: t2 },
    ];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    const audios = container.querySelectorAll('audio');
    expect(audios).toHaveLength(2);
    const streams = Array.from(audios).map((a) => a.srcObject as MediaStream);
    const allTracks = streams.flatMap((s) => s.getAudioTracks());
    expect(allTracks).toContain(t1);
    expect(allTracks).toContain(t2);
  });

  it('audio entry 가 추가되면 새 audio element 가 늘어난다 (rerender)', () => {
    const remoteMedia0: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerSocketId: 's1' }),
    ];
    const { container, rerender } = render(
      <RemoteAudioPlayer remoteMedia={remoteMedia0} />,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    rerender(
      <RemoteAudioPlayer
        remoteMedia={[
          ...remoteMedia0,
          audioEntry({ consumerId: 'ca2', peerSocketId: 's2' }),
        ]}
      />,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(2);
  });

  it('audio entry 가 제거되면 해당 audio element 가 사라진다', () => {
    const initial: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerSocketId: 's1' }),
      audioEntry({ consumerId: 'ca2', peerSocketId: 's2' }),
    ];
    const { container, rerender } = render(
      <RemoteAudioPlayer remoteMedia={initial} />,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(2);
    rerender(
      <RemoteAudioPlayer remoteMedia={[initial[0]]} />,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(1);
  });

  it('audio element 는 화면에 보이지 않게 aria-hidden 으로 처리된다', () => {
    const remoteMedia: RemoteMediaEntry[] = [
      audioEntry({ consumerId: 'ca1', peerSocketId: 's1' }),
    ];
    const { container } = render(<RemoteAudioPlayer remoteMedia={remoteMedia} />);
    // 컨테이너 또는 audio 요소가 aria-hidden 이어야 한다(접근성 + 시각적 노출 차단).
    const player = container.querySelector('[data-testid="remote-audio-player"]');
    expect(player).not.toBeNull();
    expect(player!.getAttribute('aria-hidden')).toBe('true');
  });
});
