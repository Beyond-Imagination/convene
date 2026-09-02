import { fireEvent, render, screen } from '@testing-library/react';

import type { UseJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';

import { JoinMeetingForm } from './JoinMeetingForm';

const noopRegister = (() => ({
  name: 'placeholder',
  onChange: () => Promise.resolve(true),
  onBlur: () => Promise.resolve(true),
  ref: () => {},
})) as unknown as UseJoinMeetingViewModel['register'];

const baseVm = (overrides: Partial<UseJoinMeetingViewModel> = {}): UseJoinMeetingViewModel => ({
  status: 'idle',
  errorMessage: null,
  register: noopRegister,
  errors: {},
  handleSubmit: vi.fn(),
  ...overrides,
});

describe('JoinMeetingForm View', () => {
  it('회의 코드 + 닉네임 input + 입장 버튼이 렌더된다', () => {
    render(<JoinMeetingForm {...baseVm()} />);
    expect(screen.getByLabelText('회의 코드')).toBeInTheDocument();
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '입장' })).toBeEnabled();
  });

  it('status="submitting" 이면 버튼은 "입장 중…" 으로 바뀌고 비활성화된다', () => {
    render(<JoinMeetingForm {...baseVm({ status: 'submitting' })} />);
    expect(screen.getByRole('button', { name: '입장 중…' })).toBeDisabled();
  });

  it('status="error" + errorMessage가 있으면 role="alert" 로 노출된다', () => {
    render(
      <JoinMeetingForm
        {...baseVm({ status: 'error', errorMessage: '존재하지 않는 회의 코드입니다.' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('존재하지 않는 회의 코드입니다.');
  });

  it('errors.code가 있으면 role="alert" 로 메시지를 노출한다', () => {
    render(
      <JoinMeetingForm
        {...baseVm({
          errors: { code: { type: 'pattern', message: '회의 코드 형식 오류' } },
        })}
      />,
    );
    const alert = screen.getByText('회의 코드 형식 오류');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveAttribute('data-field', 'code');
  });

  it('errors.nickname이 있으면 alert로 노출한다', () => {
    render(
      <JoinMeetingForm
        {...baseVm({
          errors: { nickname: { type: 'required', message: '닉네임 필요' } },
        })}
      />,
    );
    expect(screen.getByText('닉네임 필요')).toHaveAttribute('data-field', 'nickname');
  });

  it('폼 submit 시 vm.handleSubmit이 호출된다', () => {
    const handleSubmit = vi.fn();
    render(<JoinMeetingForm {...baseVm({ handleSubmit })} />);
    fireEvent.submit(screen.getByRole('form', { name: 'join-form' }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});
