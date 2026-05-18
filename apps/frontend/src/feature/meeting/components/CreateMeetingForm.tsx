'use client';

import type { CreateMeetingStatus } from '@/feature/meeting/hooks/useCreateMeetingViewModel';

/**
 * 회의 생성 버튼 View.
 *
 * ARCHITECTURE §4.2 — View 는 useState/useEffect/fetch/socket/zustand 호출 금지.
 * 모든 상태와 액션은 props 로 받는다. 본 컴포넌트는 ViewModel hook 의 반환을
 * 그대로 prop 으로 받아 렌더링/이벤트만 담당한다.
 */
export interface CreateMeetingFormProps {
  readonly status: CreateMeetingStatus;
  readonly errorMessage: string | null;
  readonly onSubmit: () => void;
}

export function CreateMeetingForm({
  status,
  errorMessage,
  onSubmit,
}: CreateMeetingFormProps) {
  const submitting = status === 'submitting';
  return (
    <section aria-labelledby="create-meeting-heading">
      <h2 id="create-meeting-heading">회의 만들기</h2>
      <button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? '생성 중…' : '회의 만들기'}
      </button>
      {errorMessage !== null && status === 'error' && (
        <p role="alert">{errorMessage}</p>
      )}
    </section>
  );
}
