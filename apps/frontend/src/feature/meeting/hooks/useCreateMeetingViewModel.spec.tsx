import { act, renderHook, waitFor } from '@testing-library/react';

import { MeetingApiError } from '@/shared/api/meeting.api';

import { useCreateMeetingViewModel } from './useCreateMeetingViewModel';

const pushMock = vi.fn();
const createMeetingMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/shared/api/meeting.api', async (original) => {
  const actual = (await original()) as typeof import('@/shared/api/meeting.api');
  return {
    ...actual,
    createMeeting: (...args: Parameters<typeof actual.createMeeting>) =>
      createMeetingMock(...args),
  };
});

describe('useCreateMeetingViewModel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    createMeetingMock.mockReset();
  });

  it('초기 status 는 idle, errorMessage 는 null 이다', () => {
    const { result } = renderHook(() => useCreateMeetingViewModel());
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
  });

  it('submit 은 createMeeting({ source: "web" }) 을 호출한다', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    await act(async () => {
      await result.current.submit();
    });
    expect(createMeetingMock).toHaveBeenCalledWith({ source: 'web' });
  });

  it('성공 시 router.push(`/meetings/{code}`) 로 이동한다', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    await act(async () => {
      await result.current.submit();
    });
    expect(pushMock).toHaveBeenCalledWith('/meetings/abc12xyz');
  });

  it('MeetingApiError 가 던져지면 status="error" + 해당 메시지 노출', async () => {
    createMeetingMock.mockRejectedValueOnce(new MeetingApiError(400, '잘못된 요청'));
    const { result } = renderHook(() => useCreateMeetingViewModel());
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('잘못된 요청');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('알 수 없는 에러(MeetingApiError 가 아닌)는 기본 메시지로 fallback', async () => {
    createMeetingMock.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useCreateMeetingViewModel());
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('회의 생성에 실패했습니다.');
  });

  it('submit 호출 후 잠깐은 status="submitting" 으로 전이된다', async () => {
    let resolve: (value: unknown) => void = () => {};
    createMeetingMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useCreateMeetingViewModel());
    let pending: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    await waitFor(() => expect(result.current.status).toBe('submitting'));
    await act(async () => {
      resolve({ code: 'abc12xyz', source: 'web', startedAt: '2026-01-01T00:00:00.000Z' });
      await pending;
    });
  });
});
