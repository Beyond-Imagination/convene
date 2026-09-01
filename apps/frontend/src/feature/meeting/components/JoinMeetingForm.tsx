'use client';

import type { UseJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';

export type JoinMeetingFormProps = UseJoinMeetingViewModel;

export function JoinMeetingForm({ status, register, errors, handleSubmit }: JoinMeetingFormProps) {
  const submitting = status === 'submitting';
  return (
    <form
      aria-label="join-form"
      onSubmit={handleSubmit}
      className="flex flex-col"
    >
      <h2 className="text-text text-display font-extrabold tracking-[-0.035em]">회의 입장</h2>
      <p className="text-muted text-lead mt-1.5 text-pretty md:mt-3.5">
        받은 회의 코드와 닉네임으로 기존 회의에 참여합니다.
      </p>

      <div className="mt-[clamp(1.125rem,0.8rem+1.3vw,2.75rem)] flex flex-col gap-[clamp(1rem,0.6rem+1.6vw,2rem)]">
        <div>
          <label
            htmlFor="join-code"
            className="field-label"
          >
            회의 코드
          </label>
          <input
            id="join-code"
            type="text"
            autoComplete="off"
            placeholder="예: abc-defg-hij"
            className="field-input font-mono"
            aria-invalid={errors.code !== undefined}
            {...register('code')}
          />
          {errors.code !== undefined && (
            <p
              role="alert"
              data-field="code"
              className="field-error"
            >
              {errors.code.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="join-nickname"
            className="field-label"
          >
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
            <p
              role="alert"
              data-field="nickname"
              className="field-error"
            >
              {errors.nickname.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-ghost w-full"
        >
          {submitting ? '입장 중…' : '입장'}
        </button>
      </div>
    </form>
  );
}
