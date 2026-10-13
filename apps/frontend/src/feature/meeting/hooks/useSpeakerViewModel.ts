'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { RemoteParticipant } from '@/feature/meeting/hooks/useMeetingViewModel';
import type { RemoteMediaEntry } from '@/feature/meeting/hooks/useRemoteMedia';
import { getSharedAudioContext } from '@/shared/audio-context';
import { useAudioLevelStore } from '@/shared/stores/audio-level.store';

const SAMPLE_INTERVAL_MS = 100;
const FFT_SIZE = 512;
/** RMS 경계. 넘은 개수가 레벨(막대 수)이다. */
const LEVEL_THRESHOLDS = [0.015, 0.05, 0.12] as const;
/** 말이 끊긴 뒤 강조를 유지하는 샘플 수. 음절 사이 공백에 깜빡이지 않게 한다. */
const SPEAKING_HOLD_SAMPLES = 4;
/** 이만큼 이어 말해야 발화자로 본다. 기침·맞장구로 타일이 움직이지 않게 한다. */
const ACTIVE_SPEAKER_SAMPLES = 10;

export const AUDIO_LEVEL_MAX = LEVEL_THRESHOLDS.length;

/** 내 마이크의 레벨 key. 원격은 participantId를 쓴다. */
export const SELF_AUDIO_KEY = 'self';

/** 한 번 이어 말할 때마다 seq가 오른다. 같은 사람이 다시 말해도 새 이벤트로 구분된다. */
export interface ActiveSpeaker {
  readonly participantId: string;
  readonly seq: number;
}

export interface UseSpeakerViewModel {
  readonly activeSpeaker: ActiveSpeaker | null;
}

export interface UseTileAudioLevelViewModel {
  /** 0(무음) ~ AUDIO_LEVEL_MAX. */
  readonly level: number;
  readonly isSpeaking: boolean;
}

interface Meter {
  readonly track: MediaStreamTrack;
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly buf: Float32Array<ArrayBuffer>;
  quiet: number;
  streak: number;
}

const createMeter = (ctx: AudioContext, track: MediaStreamTrack): Meter => {
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  return {
    track,
    source,
    analyser,
    buf: new Float32Array(FFT_SIZE),
    quiet: SPEAKING_HOLD_SAMPLES,
    streak: 0,
  };
};

const disposeMeter = (m: Meter): void => {
  m.source.disconnect();
  m.analyser.disconnect();
};

const levelOf = (buf: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return LEVEL_THRESHOLDS.filter((t) => rms >= t).length;
};

/**
 * 마이크를 켠 참가자 전원의 음성 레벨을 타이머 하나로 잰다. 다른 페이지에 있는 사람도
 * 말하는지 알아야 타일을 올릴 수 있어서 화면에 보이는 타일만이 아니라 전원을 잰다.
 *
 * 레벨은 store로만 흘려보내고, 이 hook은 발화자 이벤트가 날 때만 리렌더를 일으킨다.
 */
export function useSpeakerViewModel(
  localAudioTrack: MediaStreamTrack | null,
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
): UseSpeakerViewModel {
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const metersRef = useRef(new Map<string, Meter>());

  const tracks = useMemo(() => {
    const map = new Map<string, MediaStreamTrack>();
    if (localAudioTrack !== null) map.set(SELF_AUDIO_KEY, localAudioTrack);
    for (const m of remoteMedia) {
      if (m.kind === 'audio' && !m.paused) map.set(m.peerId, m.track);
    }
    return map;
  }, [localAudioTrack, remoteMedia]);

  // 바뀐 트랙만 노드를 갈아 끼운다. 전부 다시 만들면 발화 유지·연속 카운트가 끊긴다.
  useEffect(() => {
    const meters = metersRef.current;
    for (const [key, m] of meters) {
      if (tracks.get(key) !== m.track) {
        disposeMeter(m);
        meters.delete(key);
      }
    }
    if (tracks.size === meters.size) return;
    const ctx = getSharedAudioContext();
    if (ctx === null) return;
    for (const [key, track] of tracks) {
      if (!meters.has(key)) meters.set(key, createMeter(ctx, track));
    }
  }, [tracks]);

  useEffect(() => {
    const meters = metersRef.current;
    let seq = 0;
    const timer = setInterval(() => {
      const levels: Record<string, number> = {};
      const speaking: Record<string, boolean> = {};
      let promoted: string | null = null;
      for (const [key, m] of meters) {
        m.analyser.getFloatTimeDomainData(m.buf);
        const level = levelOf(m.buf);
        m.quiet = level > 0 ? 0 : m.quiet + 1;
        const isSpeaking = m.quiet < SPEAKING_HOLD_SAMPLES;
        m.streak = isSpeaking ? m.streak + 1 : 0;
        if (m.streak === ACTIVE_SPEAKER_SAMPLES && key !== SELF_AUDIO_KEY) promoted = key;
        levels[key] = level;
        speaking[key] = isSpeaking;
      }
      useAudioLevelStore.getState().publish(levels, speaking);
      if (promoted !== null) {
        seq += 1;
        setActiveSpeaker({ participantId: promoted, seq });
      }
    }, SAMPLE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      for (const m of meters.values()) disposeMeter(m);
      meters.clear();
      useAudioLevelStore.getState().reset();
    };
  }, []);

  return { activeSpeaker };
}

/** 타일 하나가 자기 key만 구독한다. 다른 참가자의 레벨 변화로는 다시 그려지지 않는다. */
export function useTileAudioLevelViewModel(key: string): UseTileAudioLevelViewModel {
  const level = useAudioLevelStore((s) => s.levels[key] ?? 0);
  const isSpeaking = useAudioLevelStore((s) => s.speaking[key] ?? false);
  return { level, isSpeaking };
}

/**
 * 첫 페이지에 안 보이는 사람이 말하면 맨 앞으로 올리고, 첫 페이지에서 가장 오래 말하지 않은
 * 사람을 다음 페이지 첫 칸으로 보낸다. 이미 보이는 사람은 움직이지 않는다.
 */
const promote = (
  order: ReadonlyArray<string>,
  speakerId: string,
  visibleSlots: number,
  lastSpoke: ReadonlyMap<string, number>,
): ReadonlyArray<string> => {
  const index = order.indexOf(speakerId);
  if (visibleSlots <= 0 || index < visibleSlots) return order;
  let victim = 0;
  for (let i = 1; i < visibleSlots; i += 1) {
    // 동률이면 뒤쪽 칸을 내보낸다.
    if ((lastSpoke.get(order[i]) ?? 0) <= (lastSpoke.get(order[victim]) ?? 0)) victim = i;
  }
  return [
    speakerId,
    ...order.slice(0, visibleSlots).filter((_, i) => i !== victim),
    order[victim],
    ...order.slice(visibleSlots).filter((id) => id !== speakerId),
  ];
};

/**
 * 원격 참가자 타일 순서. visibleSlots는 첫 페이지의 원격 칸 수(내 타일 제외)다.
 * 순서는 렌더 사이에 이어져야 하므로 ref에 둔다. seq로 같은 이벤트를 두 번 적용하지 않는다.
 */
export function useSpeakerOrderViewModel(
  participants: ReadonlyArray<RemoteParticipant>,
  activeSpeaker: ActiveSpeaker | null,
  visibleSlots: number,
): ReadonlyArray<RemoteParticipant> {
  const orderRef = useRef<ReadonlyArray<string>>([]);
  const lastSpokeRef = useRef(new Map<string, number>());
  const appliedSeqRef = useRef(0);

  return useMemo(() => {
    const byId = new Map(participants.map((p) => [p.participantId, p]));
    let order: ReadonlyArray<string> = [
      ...orderRef.current.filter((id) => byId.has(id)),
      ...participants.map((p) => p.participantId).filter((id) => !orderRef.current.includes(id)),
    ];
    if (activeSpeaker !== null && activeSpeaker.seq !== appliedSeqRef.current) {
      appliedSeqRef.current = activeSpeaker.seq;
      lastSpokeRef.current.set(activeSpeaker.participantId, activeSpeaker.seq);
      order = promote(order, activeSpeaker.participantId, visibleSlots, lastSpokeRef.current);
    }
    orderRef.current = order;
    return order.map((id) => byId.get(id)!);
  }, [participants, activeSpeaker, visibleSlots]);
}
