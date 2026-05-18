import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useSessionStore } from '@/shared/stores/session.store';

import { useJoinMeetingViewModel } from './useJoinMeetingViewModel';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function Harness() {
  const vm = useJoinMeetingViewModel();
  return (
    <form aria-label="join-form" onSubmit={vm.handleSubmit}>
      <label>
        코드
        <input data-testid="code" {...vm.register('code')} />
      </label>
      <label>
        닉네임
        <input data-testid="nickname" {...vm.register('nickname')} />
      </label>
      {vm.errors.code && (
        <span data-testid="code-error">{vm.errors.code.message}</span>
      )}
      {vm.errors.nickname && (
        <span data-testid="nickname-error">{vm.errors.nickname.message}</span>
      )}
      <button type="submit">입장</button>
    </form>
  );
}

const submit = (): void => {
  fireEvent.submit(screen.getByRole('form', { name: 'join-form' }));
};

const setInput = (testId: string, value: string): void => {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
};

describe('useJoinMeetingViewModel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useSessionStore.setState({ nickname: null });
  });

  it('정상 입력 시 닉네임을 store에 저장하고 /meetings/{code} 로 이동한다', async () => {
    render(<Harness />);
    setInput('code', 'abc12xyz');
    setInput('nickname', '준');
    submit();
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/meetings/abc12xyz'));
    expect(useSessionStore.getState().nickname).toBe('준');
  });

  it('닉네임 앞뒤 공백은 trim 해서 저장한다', async () => {
    render(<Harness />);
    setInput('code', 'abc12xyz');
    setInput('nickname', '  준  ');
    submit();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(useSessionStore.getState().nickname).toBe('준');
  });

  it('코드가 비어 있으면 router.push 가 호출되지 않고 에러 메시지 노출', async () => {
    render(<Harness />);
    setInput('nickname', '준');
    submit();
    await waitFor(() => expect(screen.getByTestId('code-error')).toHaveTextContent(/코드/));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('코드 형식 (8자 소문자 영숫자) 위반 시 에러 노출', async () => {
    render(<Harness />);
    setInput('code', 'ABC12XYZ'); // 대문자 거부
    setInput('nickname', '준');
    submit();
    await waitFor(() => expect(screen.getByTestId('code-error')).toHaveTextContent(/8자/));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('닉네임이 비어 있으면 에러 노출 + push 호출 안 됨', async () => {
    render(<Harness />);
    setInput('code', 'abc12xyz');
    submit();
    await waitFor(() =>
      expect(screen.getByTestId('nickname-error')).toHaveTextContent(/닉네임/),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('닉네임이 공백만 있어도 거부한다', async () => {
    render(<Harness />);
    setInput('code', 'abc12xyz');
    setInput('nickname', '   ');
    submit();
    await waitFor(() =>
      expect(screen.getByTestId('nickname-error')).toBeInTheDocument(),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('닉네임이 30자 초과면 거부한다', async () => {
    render(<Harness />);
    setInput('code', 'abc12xyz');
    setInput('nickname', 'a'.repeat(31));
    submit();
    await waitFor(() =>
      expect(screen.getByTestId('nickname-error')).toHaveTextContent(/30자/),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
