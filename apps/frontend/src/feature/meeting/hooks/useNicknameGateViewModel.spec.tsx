import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useSessionStore } from '@/shared/stores/session.store';

import { useNicknameGateViewModel } from './useNicknameGateViewModel';

function Harness() {
  const vm = useNicknameGateViewModel();
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
    useSessionStore.setState({ nickname: null });
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
