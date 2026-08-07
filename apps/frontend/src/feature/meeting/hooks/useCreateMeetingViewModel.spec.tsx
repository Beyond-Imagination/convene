import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';

import { MeetingApiError } from '@/shared/api/meeting.api';
import { getHostToken } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

import { useCreateMeetingViewModel } from './useCreateMeetingViewModel';

const { pushMock, createMeetingMock, routerMock } = vi.hoisted(() => {
  const pushMock = vi.fn();
  const createMeetingMock = vi.fn();
  return {
    pushMock,
    createMeetingMock,
    routerMock: { push: pushMock } as const,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/shared/api/meeting.api', async (original) => {
  const actual = (await original()) as typeof import('@/shared/api/meeting.api');
  return {
    ...actual,
    createMeeting: (...args: Parameters<typeof actual.createMeeting>) => createMeetingMock(...args),
  };
});

/**
 * react-hook-form의 register를 spec에서 직접 호출하기 까다로워, 실 input 요소에 묶어서 값/이벤트를 시뮬레이션한다.
 * ViewModel hook의 반환을 받아 input 두 개(nickname / hidden test submit)를 렌더하는 헬퍼.
 */
function makeForm(vm: ReturnType<typeof useCreateMeetingViewModel>) {
  return render(
    <form
      onSubmit={vm.handleSubmit}
      aria-label="create-form"
    >
      <input
        data-testid="nickname-input"
        {...vm.register('nickname')}
      />
      <input
        data-testid="title-input"
        {...vm.register('title')}
      />
      <button type="submit">submit</button>
    </form>,
  );
}

describe('useCreateMeetingViewModel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    createMeetingMock.mockReset();
    useSessionStore.setState({ nickname: null });
    window.sessionStorage.clear();
  });

  it('초기 status는 idle, errorMessage는 null 이다', () => {
    const { result } = renderHook(() => useCreateMeetingViewModel());
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
  });

  it('닉네임이 빈 값으로 submit 되면 검증 에러가 노출되고 createMeeting은 호출되지 않는다', async () => {
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByRole } = makeForm(result.current);
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(result.current.errors.nickname).not.toBeUndefined());
    expect(createMeetingMock).not.toHaveBeenCalled();
  });

  it('유효한 닉네임으로 submit 하면 createMeeting({source:"web"})이 호출된다', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(createMeetingMock).toHaveBeenCalled());
    expect(createMeetingMock).toHaveBeenCalledWith({ source: 'web', title: undefined });
  });

  it('제목을 입력하면 createMeeting에 title로 전달된다(앞뒤 공백 trim)', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      hostToken: 'tok',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    fireEvent.input(getByTestId('title-input'), { target: { value: '  주간 회의  ' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(createMeetingMock).toHaveBeenCalled());
    expect(createMeetingMock).toHaveBeenCalledWith({ source: 'web', title: '주간 회의' });
  });

  it('성공 시 닉네임이 session store에 set 되고 router.push(`/meetings/{code}`)로 이동한다', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: ' 준 ' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/meetings/abc12xyz'));
    expect(useSessionStore.getState().nickname).toBe('준');
  });

  it('성공 시 응답의 hostToken이 회의 code로 저장된다(host 식별용)', async () => {
    createMeetingMock.mockResolvedValueOnce({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      hostToken: 'tok-xyz',
    });
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/meetings/abc12xyz'));
    expect(getHostToken('abc12xyz')).toBe('tok-xyz');
  });

  it('MeetingApiError가 던져지면 status="error" + 해당 메시지', async () => {
    createMeetingMock.mockRejectedValueOnce(new MeetingApiError(400, '잘못된 요청'));
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('잘못된 요청');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('알 수 없는 에러는 기본 메시지로 fallback', async () => {
    createMeetingMock.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('회의 생성에 실패했습니다.');
  });

  it('submit 진행 중에는 status="submitting" 으로 전이된다', async () => {
    let resolve: (value: unknown) => void = () => {};
    createMeetingMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useCreateMeetingViewModel());
    const { getByTestId, getByRole } = makeForm(result.current);
    fireEvent.input(getByTestId('nickname-input'), { target: { value: '준' } });
    act(() => {
      fireEvent.click(getByRole('button', { name: 'submit' }));
    });
    await waitFor(() => expect(result.current.status).toBe('submitting'));
    await act(async () => {
      resolve({
        code: 'abc12xyz',
        source: 'web',
        startedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });
});
