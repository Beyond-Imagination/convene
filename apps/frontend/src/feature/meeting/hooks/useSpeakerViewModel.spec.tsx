import { act, renderHook } from '@testing-library/react';

import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useRemoteMedia';
import { getSharedAudioContext } from '@/shared/audio-context';
import { useAudioLevelStore } from '@/shared/stores/audio-level.store';

import {
  type ActiveSpeaker,
  AUDIO_LEVEL_MAX,
  SELF_AUDIO_KEY,
  useSpeakerOrderViewModel,
  useSpeakerViewModel,
  useTileAudioLevelViewModel,
} from './useSpeakerViewModel';

vi.mock('@/shared/audio-context', () => ({ getSharedAudioContext: vi.fn() }));

/** 트랙별 다음 샘플의 진폭. ±진폭 사각파라 RMS가 곧 진폭이다. */
const amplitudes = new Map<MediaStreamTrack, number>();

class FakeAnalyser {
  fftSize = 2048;
  track: MediaStreamTrack | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  getFloatTimeDomainData(buf: Float32Array): void {
    const a = this.track === null ? 0 : (amplitudes.get(this.track) ?? 0);
    for (let i = 0; i < buf.length; i += 1) buf[i] = i % 2 === 0 ? a : -a;
  }
}

class FakeSource {
  readonly track: MediaStreamTrack;
  readonly connect = vi.fn((node: FakeAnalyser) => {
    node.track = this.track;
  });
  readonly disconnect = vi.fn();
  constructor(track: MediaStreamTrack) {
    this.track = track;
  }
}

let sources: FakeSource[];
let analysers: FakeAnalyser[];
const fakeContext = {
  createMediaStreamSource: vi.fn((stream: MediaStream) => {
    const s = new FakeSource(stream.getAudioTracks()[0]);
    sources.push(s);
    return s;
  }),
  createAnalyser: vi.fn(() => {
    const a = new FakeAnalyser();
    analysers.push(a);
    return a;
  }),
};

const audioTrack = (id: string): MediaStreamTrack =>
  ({ kind: 'audio', id }) as unknown as MediaStreamTrack;

const remoteAudio = (
  peerId: string,
  track: MediaStreamTrack,
  paused = false,
): RemoteMediaEntry => ({
  consumerId: `c-${peerId}`,
  peerId,
  producerId: `p-${peerId}`,
  kind: 'audio',
  source: 'audio',
  track,
  paused,
});

/** 측정 주기 n번. */
const tick = (n = 1) =>
  act(() => {
    vi.advanceTimersByTime(100 * n);
  });

const levelOf = (key: string) => useAudioLevelStore.getState().levels[key] ?? 0;
const speakingOf = (key: string) => useAudioLevelStore.getState().speaking[key] ?? false;

describe('useSpeakerViewModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    amplitudes.clear();
    sources = [];
    analysers = [];
    fakeContext.createMediaStreamSource.mockClear();
    useAudioLevelStore.getState().reset();
    vi.mocked(getSharedAudioContext).mockReturnValue(fakeContext as unknown as AudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('내 마이크와 원격 참가자의 레벨을 각자의 key로 기록한다', () => {
    const mine = audioTrack('mine');
    const a = audioTrack('a');
    amplitudes.set(mine, 0.5);
    amplitudes.set(a, 0.03);
    renderHook(() => useSpeakerViewModel(mine, [remoteAudio('pa', a)]));
    tick();
    expect(levelOf(SELF_AUDIO_KEY)).toBe(AUDIO_LEVEL_MAX);
    expect(levelOf('pa')).toBeGreaterThan(0);
    expect(levelOf('pa')).toBeLessThan(AUDIO_LEVEL_MAX);
    expect(speakingOf(SELF_AUDIO_KEY)).toBe(true);
  });

  it('조용하면 레벨 0·발화 아님', () => {
    renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', audioTrack('a'))]));
    tick(3);
    expect(levelOf('pa')).toBe(0);
    expect(speakingOf('pa')).toBe(false);
  });

  it('음소거(paused)된 원격 오디오는 분석하지 않는다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a, true)]));
    tick();
    expect(fakeContext.createMediaStreamSource).not.toHaveBeenCalled();
    expect(levelOf('pa')).toBe(0);
  });

  it('AudioContext를 쓸 수 없는 환경이면 아무것도 기록하지 않는다', () => {
    vi.mocked(getSharedAudioContext).mockReturnValue(null);
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    const { result } = renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a)]));
    tick(20);
    expect(levelOf('pa')).toBe(0);
    expect(result.current.activeSpeaker).toBeNull();
  });

  it('말이 끊겨도 잠시 발화 강조를 유지하다가 꺼진다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a)]));
    tick();
    amplitudes.set(a, 0);
    tick();
    expect(levelOf('pa')).toBe(0);
    expect(speakingOf('pa')).toBe(true);
    tick(5);
    expect(speakingOf('pa')).toBe(false);
  });

  it('1초 넘게 이어 말한 원격 참가자가 발화자가 된다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    const { result } = renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a)]));
    tick(3);
    expect(result.current.activeSpeaker).toBeNull();
    tick(10);
    expect(result.current.activeSpeaker?.participantId).toBe('pa');
  });

  it('같은 사람이 다시 이어 말하면 새 발화 이벤트(seq 증가)가 된다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    const { result } = renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a)]));
    tick(12);
    const first = result.current.activeSpeaker;
    amplitudes.set(a, 0);
    tick(10);
    amplitudes.set(a, 0.5);
    tick(12);
    expect(result.current.activeSpeaker?.participantId).toBe('pa');
    expect(result.current.activeSpeaker!.seq).toBeGreaterThan(first!.seq);
  });

  it('내 목소리는 발화자 이벤트를 만들지 않는다', () => {
    const mine = audioTrack('mine');
    amplitudes.set(mine, 0.5);
    const { result } = renderHook(() => useSpeakerViewModel(mine, []));
    tick(20);
    expect(result.current.activeSpeaker).toBeNull();
  });

  it('트랙이 빠지면 노드를 끊고 그 key의 레벨을 지운다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    const { rerender } = renderHook(
      ({ media }: { media: RemoteMediaEntry[] }) => useSpeakerViewModel(null, media),
      { initialProps: { media: [remoteAudio('pa', a)] } },
    );
    tick();
    expect(levelOf('pa')).toBe(AUDIO_LEVEL_MAX);
    rerender({ media: [] });
    tick();
    expect(sources[0].disconnect).toHaveBeenCalled();
    expect(analysers[0].disconnect).toHaveBeenCalled();
    expect(levelOf('pa')).toBe(0);
  });

  it('다른 항목이 바뀌어도 이미 측정 중인 트랙의 노드는 다시 만들지 않는다', () => {
    const a = audioTrack('a');
    const { rerender } = renderHook(
      ({ media }: { media: RemoteMediaEntry[] }) => useSpeakerViewModel(null, media),
      { initialProps: { media: [remoteAudio('pa', a)] } },
    );
    rerender({ media: [remoteAudio('pa', a), remoteAudio('pb', audioTrack('b'))] });
    expect(fakeContext.createMediaStreamSource).toHaveBeenCalledTimes(2);
  });

  it('unmount 하면 노드를 끊고 측정을 멈추고 기록을 비운다', () => {
    const a = audioTrack('a');
    amplitudes.set(a, 0.5);
    const { unmount } = renderHook(() => useSpeakerViewModel(null, [remoteAudio('pa', a)]));
    tick();
    unmount();
    expect(sources[0].disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(levelOf('pa')).toBe(0);
  });
});

describe('useTileAudioLevelViewModel', () => {
  beforeEach(() => {
    useAudioLevelStore.getState().reset();
  });

  it('자기 key의 레벨·발화 여부만 읽는다', () => {
    const { result } = renderHook(() => useTileAudioLevelViewModel('pa'));
    expect(result.current).toEqual({ level: 0, isSpeaking: false });
    act(() => {
      useAudioLevelStore.getState().publish({ pa: 2, pb: 3 }, { pa: true, pb: true });
    });
    expect(result.current).toEqual({ level: 2, isSpeaking: true });
  });

  it('다른 key만 바뀌면 다시 렌더하지 않는다', () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useTileAudioLevelViewModel('pa');
    });
    const before = renders;
    act(() => {
      useAudioLevelStore.getState().publish({ pb: 3 }, { pb: true });
    });
    expect(renders).toBe(before);
  });
});

const participant = (id: string): RemoteParticipant => ({
  participantId: id,
  nickname: id,
  joinedAt: '2026-10-12T00:00:00.000Z',
  disconnected: false,
  handRaisedAt: null,
});

const idsOf = (list: ReadonlyArray<RemoteParticipant>) => list.map((p) => p.participantId);

describe('useSpeakerOrderViewModel', () => {
  // 모바일 한 페이지 4칸 = 내 타일 1 + 원격 3.
  const SLOTS = 3;
  const people = ['a', 'b', 'c', 'd', 'e'].map(participant);

  const renderOrder = (initial: ReadonlyArray<RemoteParticipant> = people) =>
    renderHook(
      ({
        participants,
        speaker,
      }: {
        participants: ReadonlyArray<RemoteParticipant>;
        speaker: ActiveSpeaker | null;
      }) => useSpeakerOrderViewModel(participants, speaker, SLOTS),
      { initialProps: { participants: initial, speaker: null as ActiveSpeaker | null } },
    );

  it('발화가 없으면 참가자 순서를 그대로 둔다', () => {
    const { result } = renderOrder();
    expect(idsOf(result.current)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('이미 보이는 참가자가 말하면 순서를 바꾸지 않는다', () => {
    const { result, rerender } = renderOrder();
    rerender({ participants: people, speaker: { participantId: 'b', seq: 1 } });
    expect(idsOf(result.current)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('안 보이는 참가자가 말하면 맨 앞으로 올리고, 가장 오래 말하지 않은 사람을 다음 페이지로 보낸다', () => {
    const { result, rerender } = renderOrder();
    rerender({ participants: people, speaker: { participantId: 'a', seq: 1 } });
    rerender({ participants: people, speaker: { participantId: 'b', seq: 2 } });
    rerender({ participants: people, speaker: { participantId: 'e', seq: 3 } });
    // c는 한 번도 말하지 않았다.
    expect(idsOf(result.current)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('밀려난 사람이 다시 말하면 다시 올라온다', () => {
    const { result, rerender } = renderOrder();
    rerender({ participants: people, speaker: { participantId: 'e', seq: 1 } });
    expect(idsOf(result.current).slice(0, SLOTS)).toContain('e');
    const pushedOut = idsOf(result.current)[SLOTS];
    rerender({ participants: people, speaker: { participantId: pushedOut, seq: 2 } });
    expect(idsOf(result.current)[0]).toBe(pushedOut);
    expect(idsOf(result.current).slice(0, SLOTS)).toContain('e');
  });

  it('새 참가자는 뒤에 붙고, 나간 참가자는 빠지되 나머지 순서는 유지된다', () => {
    const { result, rerender } = renderOrder();
    rerender({ participants: people, speaker: { participantId: 'e', seq: 1 } });
    const next = [...people.filter((p) => p.participantId !== 'a'), participant('f')];
    rerender({ participants: next, speaker: { participantId: 'e', seq: 1 } });
    expect(idsOf(result.current)).toEqual(['e', 'b', 'c', 'd', 'f']);
  });

  it('참가자 정보가 바뀌면 최신 객체를 돌려준다', () => {
    const { result, rerender } = renderOrder();
    const updated = people.map((p) =>
      p.participantId === 'b' ? { ...p, handRaisedAt: '2026-10-12T00:00:01.000Z' } : p,
    );
    rerender({ participants: updated, speaker: null });
    expect(result.current[1]).toBe(updated[1]);
  });
});
