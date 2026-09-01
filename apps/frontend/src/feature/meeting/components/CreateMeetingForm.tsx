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
      <h2 className="text-text text-[22px] font-extrabold tracking-[-0.03em] md:text-[40px] md:tracking-[-0.035em]">
        회의 만들기
      </h2>
      <p className="text-muted mt-1.5 text-pretty text-[13.5px] leading-[1.65] md:mt-3.5 md:text-lg md:leading-[1.75]">
        닉네임을 입력하면 새 회의를 만들고 바로 입장합니다. 제목은 선택입니다.
      </p>

      <div className="mt-[18px] flex flex-col gap-4 md:mt-11 md:gap-8">
        <div>
          <label
            htmlFor="create-title"
            className="field-label md:text-[13px]"
          >
            회의 제목 (선택)
          </label>
          <input
            id="create-title"
            type="text"
            autoComplete="off"
            placeholder="예: 주간 스프린트 회의"
            className="field-input md:text-[22px]"
            {...register('title')}
          />
        </div>

        <div>
          <label
            htmlFor="create-nickname"
            className="field-label md:text-[13px]"
          >
            닉네임
          </label>
          <input
            id="create-nickname"
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

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full md:py-5 md:text-[19px]"
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
