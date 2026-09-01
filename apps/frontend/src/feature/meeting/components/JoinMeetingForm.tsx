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
      <h2 className="text-text text-[22px] font-extrabold tracking-[-0.03em] md:text-[40px] md:tracking-[-0.035em]">
        회의 입장
      </h2>
      <p className="text-muted mt-1.5 text-pretty text-[13.5px] leading-[1.65] md:mt-3.5 md:text-lg md:leading-[1.75]">
        받은 회의 코드와 닉네임으로 기존 회의에 참여합니다.
      </p>

      <div className="mt-[18px] flex flex-col gap-4 md:mt-11 md:gap-8">
        <div>
          <label
            htmlFor="join-code"
            className="field-label md:text-[13px]"
          >
            회의 코드
          </label>
          <input
            id="join-code"
            type="text"
            autoComplete="off"
            placeholder="예: abc-defg-hij"
            className="field-input font-mono md:text-[22px]"
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
            className="field-label md:text-[13px]"
          >
            닉네임
          </label>
          <input
            id="join-nickname"
            type="text"
            autoComplete="off"
            placeholder="예: 홍길동"
            className="field-input md:text-[22px]"
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
          className="btn-ghost w-full md:py-[19px] md:text-[19px]"
        >
          {submitting ? '입장 중…' : '입장'}
        </button>
      </div>
    </form>
  );
}
