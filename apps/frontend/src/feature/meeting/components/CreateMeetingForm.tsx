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
      <h2 className="text-lg font-bold text-text">회의 만들기</h2>
      <p className="mt-1 text-sm text-muted">
        닉네임을 입력하면 새 회의를 만들고 바로 입장합니다. 제목은 선택입니다.
      </p>
      <div className="mt-4">
        <label htmlFor="create-title" className="field-label">
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
        <label htmlFor="create-nickname" className="field-label">
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
          <p role="alert" data-field="nickname" className="field-error">
            {errors.nickname.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-4 w-full">
        {submitting ? '생성 중…' : '회의 만들기'}
      </button>
      {errorMessage !== null && status === 'error' && (
        <p role="alert" className="field-error">
          {errorMessage}
        </p>
      )}
    </form>
  );
}
