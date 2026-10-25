import { renderHook } from '@testing-library/react';

import {
  useVideoQualityStore,
  VIDEO_QUALITY_STORAGE_KEY,
} from '@/shared/stores/video-quality.store';

import {
  computeVideoDemand,
  useVideoDemandViewModel,
  type VideoDemand,
  type VideoDemandInput,
} from './useVideoDemandViewModel';

const peers = ['p1', 'p2', 'p3', 'p4', 'p5'];

const base: VideoDemandInput = {
  participantIds: peers,
  page: 0,
  pageSize: 4,
  tileHeight: 300,
  variant: 'desktop',
  shareView: 'strip',
  isStripOpen: true,
  isSharing: false,
  isRemoteSharingScreen: false,
  quality: 'auto',
  pixelRatio: 1,
};

const cameraPeers = (d: VideoDemand): string[] => [...d.cameras.keys()];

describe('computeVideoDemand - 보이는 타일만 받는다', () => {
  it('첫 페이지는 내 타일이 한 칸을 차지하므로 원격은 pageSize-1 명만 받는다', () => {
    expect(cameraPeers(computeVideoDemand(base))).toEqual(['p1', 'p2', 'p3']);
  });

  it('다음 페이지로 넘기면 그 페이지의 참가자만 받는다', () => {
    expect(cameraPeers(computeVideoDemand({ ...base, page: 1 }))).toEqual(['p4', 'p5']);
  });

  it('데스크톱 공유 중 참가자 줄을 접으면 카메라는 받지 않고 공유 화면만 받는다', () => {
    const d = computeVideoDemand({
      ...base,
      isSharing: true,
      isRemoteSharingScreen: true,
      isStripOpen: false,
    });
    expect(cameraPeers(d)).toEqual([]);
    expect(d.screenLayer).not.toBeNull();
  });

  it('모바일에서 공유 화면을 보는 동안에는 참가자 카메라를 받지 않는다', () => {
    const d = computeVideoDemand({
      ...base,
      variant: 'mobile',
      shareView: 'screen',
      isSharing: true,
      isRemoteSharingScreen: true,
    });
    expect(cameraPeers(d)).toEqual([]);
    expect(d.screenLayer).not.toBeNull();
  });

  it('모바일에서 참가자 페이지로 넘기면 공유 화면을 받지 않는다', () => {
    const d = computeVideoDemand({
      ...base,
      variant: 'mobile',
      shareView: 'participants',
      isSharing: true,
      isRemoteSharingScreen: true,
    });
    expect(cameraPeers(d)).toEqual(['p1', 'p2', 'p3']);
    expect(d.screenLayer).toBeNull();
  });

  it('원격 공유가 없으면 공유 화면 수요도 없다', () => {
    expect(computeVideoDemand(base).screenLayer).toBeNull();
  });
});

describe('computeVideoDemand - 화질 레이어', () => {
  const layerOf = (input: Partial<VideoDemandInput>): number | undefined =>
    computeVideoDemand({ ...base, ...input }).cameras.get('p1');

  it('자동이면 타일이 작을수록 낮은 레이어를 받는다', () => {
    expect(layerOf({ tileHeight: 130 })).toBe(0);
    expect(layerOf({ tileHeight: 300 })).toBe(1);
    expect(layerOf({ tileHeight: 600 })).toBe(2);
  });

  it('고해상도 화면은 같은 타일에 더 많은 화소가 필요하다', () => {
    expect(layerOf({ tileHeight: 150, pixelRatio: 1 })).toBe(0);
    expect(layerOf({ tileHeight: 150, pixelRatio: 2 })).toBe(1);
  });

  it('타일 크기를 아직 못 쟀으면 중간 레이어로 시작한다', () => {
    expect(layerOf({ tileHeight: null })).toBe(1);
  });

  it('데이터 절약은 카메라·공유 화면 모두 가장 낮은 레이어다', () => {
    const d = computeVideoDemand({
      ...base,
      quality: 'saver',
      tileHeight: 900,
      isSharing: true,
      isRemoteSharingScreen: true,
    });
    expect([...d.cameras.values()]).toEqual([0, 0, 0]);
    expect(d.screenLayer).toBe(0);
  });

  it('고화질은 타일 크기와 상관없이 가장 높은 레이어다', () => {
    const d = computeVideoDemand({
      ...base,
      quality: 'high',
      tileHeight: 100,
      variant: 'mobile',
      shareView: 'participants',
    });
    expect([...d.cameras.values()]).toEqual([2, 2, 2]);
  });

  it('자동일 때 공유 화면은 모바일에서 낮은 레이어, 데스크톱에서 높은 레이어다', () => {
    const sharing = { isSharing: true, isRemoteSharingScreen: true };
    expect(computeVideoDemand({ ...base, ...sharing }).screenLayer).toBe(1);
    expect(
      computeVideoDemand({ ...base, ...sharing, variant: 'mobile', shareView: 'screen' })
        .screenLayer,
    ).toBe(0);
  });
});

describe('useVideoDemandViewModel', () => {
  const layout = {
    page: 0,
    pageSize: 4,
    tileSize: { width: 400, height: 300 },
    variant: 'desktop' as const,
    shareView: 'strip' as const,
    isStripOpen: true,
  };
  const participants = peers.map((participantId) => ({ participantId }));

  beforeEach(() => {
    window.localStorage.clear();
    useVideoQualityStore.setState({ quality: 'auto' });
  });

  it('보이는 참가자 수요를 mediasoup에 넘기고, 같은 수요는 다시 넘기지 않는다', () => {
    const setVideoDemand = vi.fn();
    const props = {
      participants,
      layout,
      isSharing: false,
      isRemoteSharingScreen: false,
      setVideoDemand,
    };
    const { rerender } = renderHook((p: typeof props) => useVideoDemandViewModel(p), {
      initialProps: props,
    });
    expect(setVideoDemand).toHaveBeenCalledTimes(1);
    expect(cameraPeers(setVideoDemand.mock.calls[0][0] as VideoDemand)).toEqual(['p1', 'p2', 'p3']);

    rerender({ ...props, participants: [...participants] });
    expect(setVideoDemand).toHaveBeenCalledTimes(1);

    rerender({ ...props, layout: { ...layout, page: 1 } });
    expect(setVideoDemand).toHaveBeenCalledTimes(2);
    expect(cameraPeers(setVideoDemand.mock.calls[1][0] as VideoDemand)).toEqual(['p4', 'p5']);
  });

  it('기기에 남긴 화질 선택을 읽어 반영한다', () => {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, 'saver');
    const setVideoDemand = vi.fn();
    renderHook(() =>
      useVideoDemandViewModel({
        participants,
        layout,
        isSharing: false,
        isRemoteSharingScreen: false,
        setVideoDemand,
      }),
    );
    const last = setVideoDemand.mock.calls.at(-1)?.[0] as VideoDemand;
    expect([...last.cameras.values()]).toEqual([0, 0, 0]);
  });
});
