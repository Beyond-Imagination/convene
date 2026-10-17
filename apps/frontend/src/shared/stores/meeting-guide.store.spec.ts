import {
  MEETING_GUIDE_STORAGE_KEY,
  useMeetingGuideStore,
} from '@/shared/stores/meeting-guide.store';

describe('useMeetingGuideStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMeetingGuideStore.setState({ showMeetingGuide: true, isHydrated: false });
  });

  it('처음 쓰는 기기에서는 가이드를 보여 준다', () => {
    useMeetingGuideStore.getState().hydrate();
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(true);
    expect(useMeetingGuideStore.getState().isHydrated).toBe(true);
  });

  it('한 번 본 기기에서는 보여 주지 않는다', () => {
    window.localStorage.setItem(MEETING_GUIDE_STORAGE_KEY, 'seen');
    useMeetingGuideStore.getState().hydrate();
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(false);
  });

  it('바꾼 선택을 기기에 남긴다', () => {
    useMeetingGuideStore.getState().setShowMeetingGuide(false);
    expect(window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY)).toBe('seen');
    useMeetingGuideStore.getState().setShowMeetingGuide(true);
    expect(window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY)).toBe('show');
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(true);
  });

  it('저장소를 쓸 수 없어도 선택은 이번 화면에 적용된다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    useMeetingGuideStore.getState().setShowMeetingGuide(false);
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(false);
    spy.mockRestore();
  });
});
