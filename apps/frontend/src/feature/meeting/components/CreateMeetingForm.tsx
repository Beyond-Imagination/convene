'use client';

import type { UseCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';

/**
 * 회의 만들기 폼 View.
 *
 * ARCHITECTURE §4.2 — View 는 useState/useEffect/fetch/socket/zustand 호출 금지.
 * ViewModel hook 의 반환을 그대로 prop 으로 받아 input/submit/error 표시만 한다.
 *
 * 입력은 닉네임 1 개 — 회의 만들고 곧바로 입장하므로 useMeetingViewModel 이
 * store.nickname 을 보고 정상 진입할 수 있게 한다.
 */
export type CreateMeetingFormProps = UseCreateMeetingViewModel;

export function CreateMeetingForm({
  status,
  errorMessage,
  register,
  errors,
  handleSubmit,
}: CreateMeetingFormProps) {
  const submitting = status === 'submitting';
  return (
    <form aria-label="create-form" onSubmit={handleSubmit}>
      <h2>회의 만들기</h2>
      <p>
        <label>
          닉네임
          <input
            type="text"
            autoComplete="off"
            aria-invalid={errors.nickname !== undefined}
            {...register('nickname')}
          />
        </label>
      </p>
      {errors.nickname !== undefined && (
        <p role="alert" data-field="nickname">
          {errors.nickname.message}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? '생성 중…' : '회의 만들기'}
      </button>
      {errorMessage !== null && status === 'error' && (
        <p role="alert">{errorMessage}</p>
      )}
    </form>
  );
}
