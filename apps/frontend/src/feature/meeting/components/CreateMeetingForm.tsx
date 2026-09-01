'use client';

import type { UseCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';

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
    <form
      aria-label="create-form"
      onSubmit={handleSubmit}
      className="flex flex-col"
    >
      <h2 className="text-text text-display font-extrabold tracking-[-0.035em]">회의 만들기</h2>
      <p className="text-muted text-lead mt-1.5 text-pretty md:mt-3.5">
        닉네임을 입력하면 새 회의를 만들고 바로 입장합니다. 제목은 선택입니다.
      </p>

      <div className="mt-[clamp(1.125rem,0.8rem+1.3vw,2.75rem)] flex flex-col gap-[clamp(1rem,0.6rem+1.6vw,2rem)]">
        <div>
          <label
            htmlFor="create-title"
            className="field-label"
          >
            회의 제목 (선택)
          </label>
          <input
            id="create-title"
            type="text"
            autoComplete="off"
            placeholder="예: 주간 스프린트 회의"
            className="field-input"
            {...register('title')}
          />
        </div>

        <div>
          <label
            htmlFor="create-nickname"
            className="field-label"
          >
            닉네임
          </label>
          <input
            id="create-nickname"
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

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? '생성 중…' : '회의 만들기'}
          </button>
          {errorMessage !== null && status === 'error' && (
            <p
              role="alert"
              className="field-error"
            >
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
