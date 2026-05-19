import { fireEvent, render, screen } from '@testing-library/react';
import type {
  FieldErrors,
  UseFormRegisterReturn,
} from 'react-hook-form';

import type {
  CreateMeetingFormValues,
  UseCreateMeetingViewModel,
} from '@/feature/meeting/hooks/useCreateMeetingViewModel';

import { CreateMeetingForm } from './CreateMeetingForm';

/**
 * spec 전용 register: react-hook-form 의 실제 register 를 흉내내서 input 에 묶을
 * 수 있는 최소 형태만 돌려준다. View 가 register 의 반환을 `...spread` 하는 동작만
 * 검증 가능하면 충분하다.
 */
const fakeRegister = (
  name: keyof CreateMeetingFormValues,
): UseFormRegisterReturn => ({
  name,
  onChange: async () => true,
  onBlur: async () => true,
  ref: () => {},
});

const baseVm = (
  overrides: Partial<UseCreateMeetingViewModel> = {},
): UseCreateMeetingViewModel => ({
  status: 'idle',
  errorMessage: null,
  register: fakeRegister,
  errors: {} as FieldErrors<CreateMeetingFormValues>,
  handleSubmit: vi.fn(async () => {}),
  ...overrides,
});

describe('CreateMeetingForm View', () => {
  it('status="idle" 이면 버튼이 활성화되고 "회의 만들기" 라벨을 노출한다', () => {
    render(<CreateMeetingForm {...baseVm()} />);
    expect(screen.getByRole('button', { name: '회의 만들기' })).toBeEnabled();
  });

  it('status="submitting" 이면 버튼이 비활성화되고 "생성 중…" 라벨을 노출한다', () => {
    render(<CreateMeetingForm {...baseVm({ status: 'submitting' })} />);
    expect(screen.getByRole('button', { name: '생성 중…' })).toBeDisabled();
  });

  it('닉네임 input 이 노출된다', () => {
    render(<CreateMeetingForm {...baseVm()} />);
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument();
  });

  it('errors.nickname 이 있으면 해당 필드 alert 가 노출된다', () => {
    render(
      <CreateMeetingForm
        {...baseVm({
          errors: {
            nickname: { type: 'required', message: '닉네임을 입력하세요.' },
          } as FieldErrors<CreateMeetingFormValues>,
        })}
      />,
    );
    expect(screen.getByText('닉네임을 입력하세요.')).toBeInTheDocument();
  });

  it('status="error" + errorMessage 가 있으면 role="alert" 로 노출된다', () => {
    render(
      <CreateMeetingForm
        {...baseVm({ status: 'error', errorMessage: '잘못된 요청' })}
      />,
    );
    expect(screen.getByText('잘못된 요청')).toBeInTheDocument();
  });

  it('폼 submit 시 handleSubmit 콜백이 호출된다', () => {
    const handleSubmit = vi.fn(async () => {});
    render(<CreateMeetingForm {...baseVm({ handleSubmit })} />);
    fireEvent.submit(screen.getByRole('form', { name: 'create-form' }));
    expect(handleSubmit).toHaveBeenCalled();
  });
});
