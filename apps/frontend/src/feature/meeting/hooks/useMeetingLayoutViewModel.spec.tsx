import { act, renderHook } from '@testing-library/react';

import { useMeetingLayoutViewModel } from './useMeetingLayoutViewModel';

/**
 * 회의 페이지의 순수 레이아웃 상태(채팅 패널 열림/닫힘)를 담는 ViewModel.
 * View 는 useState 를 직접 쓸 수 없으므로 토글 상태를
 * 이 hook 으로 분리한다.
 */
describe('useMeetingLayoutViewModel', () => {
  it('기본적으로 채팅 패널이 열려 있다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    expect(result.current.isChatOpen).toBe(true);
  });

  it('toggleChat 을 호출하면 열림/닫힘이 반전된다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    act(() => result.current.toggleChat());
    expect(result.current.isChatOpen).toBe(false);
    act(() => result.current.toggleChat());
    expect(result.current.isChatOpen).toBe(true);
  });
});

describe('useMeetingLayoutViewModel - 비디오 페이지네이션', () => {
  // pageSize 는 뷰포트 너비에 따라 달라지므로 런타임 값을 읽어 검증한다.
  it('타일 수가 pageSize 이하면 페이지는 1개이고 이동 불가', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: Math.max(1, size - 1) });
    expect(result.current.page).toBe(0);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(false);
  });

  it('타일 수가 pageSize 를 넘으면 다음/이전 페이지로 이동할 수 있다', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: size + 1 }); // 한 페이지 초과 → 2 페이지
    expect(result.current.pageCount).toBe(2);
    expect(result.current.canNext).toBe(true);
    expect(result.current.canPrev).toBe(false);
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(1);
    expect(result.current.canNext).toBe(false);
    expect(result.current.canPrev).toBe(true);
    act(() => result.current.prevPage());
    expect(result.current.page).toBe(0);
  });

  it('타일이 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 보정된다', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: size * 2 + 1 }); // 3 페이지
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);
    rerender({ n: size }); // 1 페이지로 축소
    expect(result.current.page).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });
});
