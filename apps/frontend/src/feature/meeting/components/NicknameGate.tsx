'use client';

import type { UseNicknameGateViewModel } from '@/feature/meeting/hooks/useNicknameGateViewModel';

export interface NicknameGateProps extends UseNicknameGateViewModel {
  readonly code: string;
  /** 회의 제목. 있으면 어떤 회의에 들어가는지 모달에서 바로 보여준다. */
  readonly title?: string | null;
}

/**
 * 회의 링크로 직접 접속한(닉네임 없는) 사용자에게 보여주는 닉네임 입력 게이트 View.
 */
export function NicknameGate({
  code,
  title = null,
  status,
  availability,
  canSubmit,
  errorMessage,
  register,
  errors,
  handleSubmit,
}: NicknameGateProps) {
  const submitting = status === 'submitting';
  return (
    <div className="bg-bg text-text relative flex h-screen items-center justify-center overflow-hidden">
      {/* 배경: 회의 화면 톤의 헤더 + 빈 영역 */}
      <div
        className="absolute inset-0 flex flex-col"
        aria-hidden="true"
      >
        <header className="border-border px-gutter py-gutter-sm border-b">
          <p className="text-muted text-meta font-mono font-medium">회의 {code}</p>
        </header>
        <div className="flex-1" />
      </div>

      {/* 닉네임 입력 모달 */}
      <div className="bg-paper relative z-10 mx-4 w-full max-w-[clamp(22.5rem,20.588rem+7.843vw,30rem)] p-[clamp(1.75rem,1.4375rem+1.2549vw,2.5rem)] shadow-[0_20px_46px_rgba(0,0,0,0.28)]">
        <h1 className="text-text text-title font-extrabold tracking-[-0.03em]">회의 입장</h1>
        {title !== null && <p className="text-text text-body mt-1.5 truncate font-bold">{title}</p>}
        <p className="text-muted text-lead mt-2">닉네임을 입력하면 이 회의에 참여합니다.</p>
        <form
          aria-label="nickname-gate-form"
          onSubmit={handleSubmit}
          className="mt-6"
        >
          <label
            htmlFor="gate-nickname"
            className="field-label"
          >
            닉네임
          </label>
          <input
            id="gate-nickname"
            type="text"
            autoComplete="off"
            placeholder="예: 홍길동"
            className="field-input"
            aria-invalid={errors.nickname !== undefined}
            {...register('nickname')}
          />
          {errors.nickname !== undefined ? (
            <p
              role="alert"
              data-field="nickname"
              className="field-error"
            >
              {errors.nickname.message}
            </p>
          ) : (
            errorMessage !== null && (
              <p
                role="alert"
                data-field="nickname"
                className="field-error"
              >
                {errorMessage}
              </p>
            )
          )}
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="btn-primary mt-6 w-full"
          >
            {submitting ? '입장 중…' : availability === 'checking' ? '확인 중…' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
