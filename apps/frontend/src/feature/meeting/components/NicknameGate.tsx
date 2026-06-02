'use client';

import type { UseNicknameGateViewModel } from '@/feature/meeting/hooks/useNicknameGateViewModel';

/**
 * 회의 링크로 직접 접속한(닉네임 없는) 사용자에게 보여주는 닉네임 입력 게이트 View.
 *
 * 회의 화면 톤(`.theme-dark`)의 배경 위에 중앙 모달 카드로 닉네임만 입력받는다.
 * 회의 코드는 URL 에서 이미 정해졌으므로 헤더에 안내만 한다. ARCHITECTURE §4.2 —
 * View 는 props 만으로 렌더하며, 상태/검증은 `useNicknameGateViewModel` 이 담당한다.
 */
export interface NicknameGateProps extends UseNicknameGateViewModel {
  readonly code: string;
}

export function NicknameGate({
  code,
  status,
  register,
  errors,
  handleSubmit,
}: NicknameGateProps) {
  const submitting = status === 'submitting';
  return (
    <div className="theme-dark relative flex h-screen items-center justify-center overflow-hidden bg-bg text-text">
      {/* 배경: 회의 화면 톤의 헤더 + 빈 영역 */}
      <div className="absolute inset-0 flex flex-col" aria-hidden="true">
        <header className="border-b border-border px-5 py-3">
          <h1 className="text-base font-semibold text-text">회의 {code}</h1>
        </header>
        <div className="flex-1" />
      </div>

      {/* 닉네임 입력 모달 */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-bold text-text">회의 입장</h2>
        <p className="mt-1 text-sm text-muted">닉네임을 입력하면 이 회의에 참여합니다.</p>
        <form aria-label="nickname-gate-form" onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="gate-nickname" className="field-label">
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
          {errors.nickname !== undefined && (
            <p role="alert" data-field="nickname" className="field-error">
              {errors.nickname.message}
            </p>
          )}
          <button type="submit" disabled={submitting} className="btn-primary mt-4 w-full">
            {submitting ? '입장 중…' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
