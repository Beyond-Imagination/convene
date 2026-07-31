import { renderHook } from '@testing-library/react';

import { useEmbedGateViewModel } from './useEmbedGateViewModel';

/** 다른 창에 박힌 상태를 흉내낸다. cross-origin이라도 self/top 참조 비교 자체는 막히지 않는다. */
function pretendEmbedded(): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'top');
  Object.defineProperty(window, 'top', { value: {} as Window, configurable: true });
  return () => {
    if (original === undefined) delete (window as { top?: unknown }).top;
    else Object.defineProperty(window, 'top', original);
  };
}

describe('useEmbedGateViewModel', () => {
  it('최상위 창이면 standalone', () => {
    const { result } = renderHook(() => useEmbedGateViewModel());
    expect(result.current.status).toBe('standalone');
  });

  it('iframe 안이면 embedded', () => {
    const restore = pretendEmbedded();
    try {
      const { result } = renderHook(() => useEmbedGateViewModel());
      expect(result.current.status).toBe('embedded');
    } finally {
      restore();
    }
  });

  it('embedded면 새 탭으로 열 현재 주소를 함께 준다', () => {
    const restore = pretendEmbedded();
    try {
      const { result } = renderHook(() => useEmbedGateViewModel());
      expect(result.current.pageUrl).toBe(window.location.href);
    } finally {
      restore();
    }
  });
});
