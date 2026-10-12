import { create } from 'zustand';

type Snapshot = Readonly<Record<string, number | boolean>>;

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/**
 * 참가자별 음성 레벨·발화 여부. 초당 여러 번 바뀌므로 회의 화면이 아니라
 * 각 타일이 자기 key만 구독해 그 타일만 다시 그린다.
 */
export interface AudioLevelState {
  readonly levels: Readonly<Record<string, number>>;
  readonly speaking: Readonly<Record<string, boolean>>;
  /** 바뀐 것이 없으면 구독자를 깨우지 않는다. */
  readonly publish: (
    levels: Readonly<Record<string, number>>,
    speaking: Readonly<Record<string, boolean>>,
  ) => void;
  readonly reset: () => void;
}

export const useAudioLevelStore = create<AudioLevelState>((set, get) => ({
  levels: {},
  speaking: {},
  publish: (levels, speaking) => {
    const prev = get();
    if (sameSnapshot(prev.levels, levels) && sameSnapshot(prev.speaking, speaking)) return;
    set({ levels, speaking });
  },
  reset: () => set({ levels: {}, speaking: {} }),
}));
