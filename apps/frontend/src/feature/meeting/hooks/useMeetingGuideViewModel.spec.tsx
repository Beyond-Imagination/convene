import { act, renderHook } from '@testing-library/react';

import {
  MEETING_GUIDE_STORAGE_KEY,
  useMeetingGuideStore,
} from '@/shared/stores/meeting-guide.store';

import { MEETING_GUIDE_STEPS, useMeetingGuideViewModel } from './useMeetingGuideViewModel';

interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const target = (id: string, box: Box = { top: 100, left: 100, width: 40, height: 40 }) => {
  const el = document.createElement('button');
  el.dataset.guide = id;
  el.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
};

const setup = (initial: { ready: boolean; blocked: boolean } = { ready: true, blocked: false }) =>
  renderHook((props: { ready: boolean; blocked: boolean }) => useMeetingGuideViewModel(props), {
    initialProps: initial,
  });

describe('useMeetingGuideViewModel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    useMeetingGuideStore.setState({ showMeetingGuide: true, isHydrated: false });
  });

  it('회의에 연결되기 전에는 시작하지 않는다', () => {
    target('media');
    const { result } = setup({ ready: false, blocked: false });
    expect(result.current.isActive).toBe(false);
  });

  it('처음이면 연결되자마자 첫 단계부터 보여 준다', () => {
    target('media');
    target('chat');
    const { result } = setup();
    expect(result.current.isActive).toBe(true);
    expect(result.current.step?.id).toBe('media');
    expect(result.current.index).toBe(0);
  });

  it('화면에 없거나 숨겨진 대상의 단계는 건너뛰고 남은 단계만 센다', () => {
    target('media');
    target('reaction', { top: 0, left: 0, width: 0, height: 0 });
    target('chat');
    target('screen-share');
    target('leave');
    const { result } = setup();
    expect(result.current.total).toBe(4);
    act(() => result.current.next());
    expect(result.current.step?.id).toBe('screen-share');
    act(() => result.current.next());
    expect(result.current.step?.id).toBe('chat');
    act(() => result.current.prev());
    expect(result.current.step?.id).toBe('screen-share');
  });

  it('화면 공유 버튼이 없으면(모바일) 공유할 수 없다는 안내 단계를 가운데에 보여 준다', () => {
    target('media');
    target('leave');
    const { result } = setup();
    expect(result.current.total).toBe(3);
    act(() => result.current.next());
    expect(result.current.step?.id).toBe('screen-share');
    expect(result.current.step?.body).not.toBe(
      MEETING_GUIDE_STEPS.find((s) => s.id === 'screen-share')?.body,
    );
    expect(result.current.rect).toBeNull();
  });

  it('같은 표시가 여럿이면 모두를 둘러싼 영역을 밝힌다', () => {
    target('media', { top: 600, left: 100, width: 60, height: 50 });
    target('media', { top: 600, left: 170, width: 60, height: 50 });
    const { result } = setup();
    expect(result.current.rect).toEqual({ top: 600, left: 100, width: 130, height: 50 });
  });

  it('마지막 단계에서 다음을 누르면 끝내고 다시 보지 않게 남긴다', () => {
    target('media');
    target('screen-share');
    const { result } = setup();
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.isActive).toBe(false);
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(false);
    expect(window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY)).toBe('seen');
  });

  it('건너뛰어도 다시 보지 않게 남긴다', () => {
    target('media');
    const { result } = setup();
    act(() => result.current.skip());
    expect(result.current.isActive).toBe(false);
    expect(window.localStorage.getItem(MEETING_GUIDE_STORAGE_KEY)).toBe('seen');
  });

  it('이미 본 기기에서는 시작하지 않는다', () => {
    window.localStorage.setItem(MEETING_GUIDE_STORAGE_KEY, 'seen');
    target('media');
    const { result } = setup();
    expect(result.current.isActive).toBe(false);
  });

  it('모달이 열려 있으면 기다렸다가 닫히면 시작한다', () => {
    target('media');
    const { result, rerender } = setup({ ready: true, blocked: true });
    expect(result.current.isActive).toBe(false);
    rerender({ ready: true, blocked: false });
    expect(result.current.isActive).toBe(true);
  });

  it('설정에서 다시 켜면 회의 중에도 다시 시작한다', () => {
    target('media');
    const { result } = setup();
    act(() => result.current.skip());
    act(() => useMeetingGuideStore.getState().setShowMeetingGuide(true));
    expect(result.current.isActive).toBe(true);
    expect(result.current.index).toBe(0);
  });

  it('밝힐 대상이 하나도 없으면 시작하지 않는다', () => {
    const { result } = setup();
    expect(result.current.isActive).toBe(false);
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(true);
  });
});
