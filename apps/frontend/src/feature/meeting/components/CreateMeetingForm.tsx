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
    >
      <h2 className="text-text text-lg font-bold">회의 만들기</h2>
      <p className="text-muted mt-1 text-sm">
        닉네임을 입력하면 새 회의를 만들고 바로 입장합니다. 제목은 선택입니다.
      </p>
      <div className="mt-4">
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
      <div className="mt-3">
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
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary mt-4 w-full"
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
    </form>
  );
}
