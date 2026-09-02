import { act, renderHook, waitFor } from '@testing-library/react';

import { useMeetingLinkViewModel } from './useMeetingLinkViewModel';

const writeText = vi.fn();

const linkOf = (code: string): string => `${window.location.origin}/meetings/${code}`;

describe('useMeetingLinkViewModel', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('회의 링크는 현재 origin 기준의 회의 주소다', async () => {
    const { result } = renderHook(() => useMeetingLinkViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.url).toBe(linkOf('abc12xyz')));
  });

  it('복사하면 회의 링크를 클립보드에 쓰고 copied가 된다', async () => {
    const { result } = renderHook(() => useMeetingLinkViewModel('abc12xyz'));
    await act(async () => {
      result.current.copy();
    });
    expect(writeText).toHaveBeenCalledWith(linkOf('abc12xyz'));
    expect(result.current.status).toBe('copied');
  });

  it('복사 피드백은 잠시 뒤 사라진다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderHook(() => useMeetingLinkViewModel('abc12xyz'));
      await act(async () => {
        result.current.copy();
      });
      expect(result.current.status).toBe('copied');

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('클립보드를 쓸 수 없으면 error로 알린다', async () => {
    writeText.mockRejectedValueOnce(new Error('permission denied'));
    const { result } = renderHook(() => useMeetingLinkViewModel('abc12xyz'));
    await act(async () => {
      result.current.copy();
    });
    expect(result.current.status).toBe('error');
  });
});
