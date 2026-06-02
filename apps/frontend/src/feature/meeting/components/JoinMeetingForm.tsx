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
      <h2 className="text-lg font-bold text-text">회의 입장</h2>
      <p className="mt-1 text-sm text-muted">
        받은 회의 코드와 닉네임으로 기존 회의에 참여합니다.
      </p>
      <div className="mt-4">
        <label htmlFor="join-code" className="field-label">
          회의 코드
        </label>
        <input
          id="join-code"
          type="text"
          autoComplete="off"
          placeholder="예: abc-defg-hij"
          className="field-input"
          aria-invalid={errors.code !== undefined}
          {...register('code')}
        />
        {errors.code !== undefined && (
          <p role="alert" data-field="code" className="field-error">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="mt-3">
        <label htmlFor="join-nickname" className="field-label">
          닉네임
        </label>
        <input
          id="join-nickname"
          type="text"
          autoComplete="off"
          placeholder="예: 홍길동"
          className="field-input"
          aria-invalid={errors.nickname !== undefined}
          {...register('nickname')}
        />
        {errors.nickname !== undefined && (
          <p role="alert" data-field="nickname" className="field-error">
            {errors.nickname.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={submitting} className="btn-ghost mt-4 w-full">
        {submitting ? '입장 중…' : '입장'}
      </button>
    </form>
  );
}
