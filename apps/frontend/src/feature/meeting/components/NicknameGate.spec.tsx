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

  it('errors.nickname 이 있으면 에러 메시지를 노출한다', () => {
    render(
      <NicknameGate
        {...baseProps}
        errors={{ nickname: { type: 'required', message: '닉네임을 입력하세요.' } } as never}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('닉네임을 입력하세요.');
  });

  it('submitting 상태에서 버튼이 비활성화된다', () => {
    render(<NicknameGate {...baseProps} status="submitting" />);
    expect(screen.getByRole('button', { name: /입장/ })).toBeDisabled();
  });
});
