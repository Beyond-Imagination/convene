import {
  useVideoQualityStore,
  VIDEO_QUALITY_STORAGE_KEY,
} from '@/shared/stores/video-quality.store';

describe('useVideoQualityStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useVideoQualityStore.setState({ quality: 'auto' });
  });

  it('저장값이 없으면 자동이다', () => {
    useVideoQualityStore.getState().hydrate();
    expect(useVideoQualityStore.getState().quality).toBe('auto');
  });

  it('기기에 남긴 선택을 읽는다', () => {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, 'saver');
    useVideoQualityStore.getState().hydrate();
    expect(useVideoQualityStore.getState().quality).toBe('saver');
  });

  it('알 수 없는 저장값은 자동으로 본다', () => {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, 'ultra');
    useVideoQualityStore.getState().hydrate();
    expect(useVideoQualityStore.getState().quality).toBe('auto');
  });

  it('바꾼 선택을 기기에 남긴다', () => {
    useVideoQualityStore.getState().setQuality('high');
    expect(useVideoQualityStore.getState().quality).toBe('high');
    expect(window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY)).toBe('high');
  });

  it('저장소를 쓸 수 없어도 선택은 이번 화면에 적용된다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    useVideoQualityStore.getState().setQuality('saver');
    expect(useVideoQualityStore.getState().quality).toBe('saver');
    spy.mockRestore();
  });
});
