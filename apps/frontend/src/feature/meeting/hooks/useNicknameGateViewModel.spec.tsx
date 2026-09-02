import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import { useSessionStore } from '@/shared/stores/session.store';

const { checkNicknameMock } = vi.hoisted(() => ({ checkNicknameMock: vi.fn() }));
vi.mock('@/shared/api/meeting.api', async (original) => {
  const actual = (await original()) as typeof import('@/shared/api/meeting.api');
  return {
    ...actual,
    checkNicknameAvailability: (...args: Parameters<typeof actual.checkNicknameAvailability>) =>
      checkNicknameMock(...args),
  };
});

import { useNicknameGateViewModel } from './useNicknameGateViewModel';

function Harness() {
  const vm = useNicknameGateViewModel('abc12xyz');
  return (
    <form
      aria-label="gate-form"
      onSubmit={vm.handleSubmit}
    >
      <input
        data-testid="nickname"
        {...vm.register('nickname')}
      />
      {vm.errors.nickname && <span data-testid="nickname-error">{vm.errors.nickname.message}</span>}
      <span data-testid="availability">{vm.availability}</span>
      <span data-testid="can-submit">{String(vm.canSubmit)}</span>
      <span data-testid="gate-error">{vm.errorMessage}</span>
      <button type="submit">입장하기</button>
    </form>
  );
}

const submit = (): void => {
  fireEvent.submit(screen.getByRole('form', { name: 'gate-form' }));
};
const setInput = (value: string): void => {
  fireEvent.change(screen.getByTestId('nickname'), { target: { value } });
};

describe('useNicknameGateViewModel', () => {
  beforeEach(() => {
    checkNicknameMock.mockReset();
    checkNicknameMock.mockResolvedValue({ nickname: '준', available: true });
    useSessionStore.setState({ nickname: null });
    // 폼 기본값이 보관 닉네임에서 채워지므로, 빈 입력 검증에는 비워 둔 상태가 필요하다.
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('유효한 닉네임 submit 시 trim 해서 session store에 저장한다', async () => {
    render(<Harness />);
    setInput('  준  ');
    submit();
    await waitFor(() => expect(useSessionStore.getState().nickname).toBe('준'));
  });

  it('닉네임이 비어 있으면 저장하지 않고 에러를 노출한다', async () => {
    render(<Harness />);
    submit();
    await waitFor(() => expect(screen.getByTestId('nickname-error')).toHaveTextContent(/닉네임/));
    expect(useSessionStore.getState().nickname).toBeNull();
  });

  it('닉네임이 공백만 있어도 거부한다', async () => {
    render(<Harness />);
    setInput('   ');
    submit();
    await waitFor(() => expect(screen.getByTestId('nickname-error')).toBeInTheDocument());
    expect(useSessionStore.getState().nickname).toBeNull();
  });

  it('닉네임이 30자 초과면 거부한다', async () => {
    render(<Harness />);
    setInput('a'.repeat(31));
    submit();
    await waitFor(() => expect(screen.getByTestId('nickname-error')).toHaveTextContent(/30자/));
    expect(useSessionStore.getState().nickname).toBeNull();
  });
});

describe('useNicknameGateViewModel 거부 후 재시도', () => {
  it('입장이 거부되면 다시 제출할 수 있게 상태를 되돌린다', () => {
    const { result, rerender } = renderHook(
      ({ error }: { error: string | null }) => useNicknameGateViewModel('abc12xyz', error),
      { initialProps: { error: null as string | null } },
    );

    act(() => {
      void result.current.handleSubmit();
    });
    rerender({ error: '이미 사용 중인 닉네임입니다.' });

    expect(result.current.status).toBe('idle');
  });
});

describe('useNicknameGateViewModel 중복 사전 확인', () => {
  beforeEach(() => {
    checkNicknameMock.mockReset();
    checkNicknameMock.mockResolvedValue({ nickname: '준', available: true });
    useSessionStore.setState({ nickname: null });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const typeAndSettle = async (value: string): Promise<void> => {
    setInput(value);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  };

  it('타이핑이 멈추기 전에는 조회하지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness />);
      setInput('준');
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(checkNicknameMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('입력이 멈추면 조회해서 중복이면 taken으로 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      checkNicknameMock.mockResolvedValue({ nickname: '준', available: false });
      render(<Harness />);
      await typeAndSettle('준');
      expect(checkNicknameMock).toHaveBeenCalledWith('abc12xyz', '준', expect.any(String));
      expect(screen.getByTestId('availability')).toHaveTextContent('taken');
      expect(screen.getByTestId('gate-error')).not.toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('쓸 수 있는 닉네임이면 available', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness />);
      await typeAndSettle('준');
      expect(screen.getByTestId('availability')).toHaveTextContent('available');
      expect(screen.getByTestId('gate-error')).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it('확인 전에는 제출할 수 없다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness />);
      setInput('준');
      expect(screen.getByTestId('can-submit')).toHaveTextContent('false');
      await typeAndSettle('준');
      expect(screen.getByTestId('can-submit')).toHaveTextContent('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('조회에 실패하면 입장을 막고 이유를 알린다 (서버가 죽었으면 어차피 못 들어간다)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      checkNicknameMock.mockRejectedValue(new Error('network'));
      render(<Harness />);
      await typeAndSettle('준');
      expect(screen.getByTestId('availability')).toHaveTextContent('unverified');
      expect(screen.getByTestId('can-submit')).toHaveTextContent('false');
      expect(screen.getByTestId('gate-error')).not.toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });
});
