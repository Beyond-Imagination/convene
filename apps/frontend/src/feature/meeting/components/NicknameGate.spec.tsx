import { render, screen } from '@testing-library/react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { NicknameGate, type NicknameGateProps } from './NicknameGate';

const noopRegister = (name: string): UseFormRegisterReturn =>
  ({
    name,
    onChange: async () => {},
    onBlur: async () => {},
    ref: () => {},
  }) as unknown as UseFormRegisterReturn;

const baseProps: NicknameGateProps = {
  code: 'abc12xyz',
  status: 'idle',
  availability: 'unknown',
  canSubmit: false,
  errorMessage: null,
  register: noopRegister,
  errors: {},
  handleSubmit: async () => {},
};

describe('NicknameGate', () => {
  it('회의 코드와 닉네임 입력 폼을 렌더한다', () => {
    render(<NicknameGate {...baseProps} />);
    expect(screen.getByText(/abc12xyz/)).toBeInTheDocument();
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /입장/ })).toBeInTheDocument();
  });

  it('회의 제목이 있으면 어떤 회의에 들어가는지 같이 보여준다', () => {
    const { unmount } = render(<NicknameGate {...baseProps} />);
    expect(screen.queryByText('주간 스프린트 회의')).toBeNull();
    unmount();

    render(
      <NicknameGate
        {...baseProps}
        title="주간 스프린트 회의"
      />,
    );
    expect(screen.getByText('주간 스프린트 회의')).toBeInTheDocument();
  });

  it('확인되기 전에는 입장 버튼이 비활성이다', () => {
    render(<NicknameGate {...baseProps} />);
    expect(screen.getByRole('button', { name: /입장/ })).toBeDisabled();
  });

  it('확인 중에는 버튼이 확인 중임을 알린다', () => {
    render(
      <NicknameGate
        {...baseProps}
        availability="checking"
      />,
    );
    expect(screen.getByRole('button', { name: '확인 중…' })).toBeDisabled();
  });

  it('쓸 수 있는 닉네임으로 확인되면 입장할 수 있다', () => {
    render(
      <NicknameGate
        {...baseProps}
        availability="available"
        canSubmit
      />,
    );
    expect(screen.getByRole('button', { name: '입장하기' })).toBeEnabled();
  });

  it('중복 닉네임이면 입장 버튼을 비활성화한다', () => {
    render(
      <NicknameGate
        {...baseProps}
        availability="taken"
        errorMessage="이미 사용 중인 닉네임입니다."
      />,
    );
    expect(screen.getByRole('button', { name: /입장/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임입니다.');
  });

  it('서버가 준 오류(닉네임 중복)를 빨간 메시지로 노출한다', () => {
    render(
      <NicknameGate
        {...baseProps}
        errorMessage="이미 사용 중인 닉네임입니다."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임입니다.');
  });

  it('errors.nickname이 있으면 에러 메시지를 노출한다', () => {
    render(
      <NicknameGate
        {...baseProps}
        errors={{ nickname: { type: 'required', message: '닉네임을 입력하세요.' } } as never}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('닉네임을 입력하세요.');
  });

  it('submitting 상태에서 버튼이 비활성화된다', () => {
    render(
      <NicknameGate
        {...baseProps}
        status="submitting"
      />,
    );
    expect(screen.getByRole('button', { name: /입장/ })).toBeDisabled();
  });
});
