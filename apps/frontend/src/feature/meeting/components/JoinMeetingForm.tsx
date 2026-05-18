'use client';

import type { UseJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';

/**
 * 회의 입장 폼 View.
 *
 * ARCHITECTURE §4.2 — View 는 props 만으로 렌더한다. ViewModel hook 의 반환을
 * 그대로 prop 타입으로 받는 패턴을 사용한다(`UseJoinMeetingViewModel`).
 */
export type JoinMeetingFormProps = UseJoinMeetingViewModel;

export function JoinMeetingForm({
  status,
  register,
  errors,
  handleSubmit,
}: JoinMeetingFormProps) {
  const submitting = status === 'submitting';
  return (
    <form aria-label="join-form" onSubmit={handleSubmit}>
      <h2>회의 입장</h2>
      <p>
        <label>
          회의 코드
          <input
            type="text"
            autoComplete="off"
            aria-invalid={errors.code !== undefined}
            {...register('code')}
          />
        </label>
      </p>
      {errors.code !== undefined && (
        <p role="alert" data-field="code">
          {errors.code.message}
        </p>
      )}
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
        {submitting ? '입장 중…' : '입장'}
      </button>
    </form>
  );
}
