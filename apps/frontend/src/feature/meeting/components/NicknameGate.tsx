'use client';

import type { UseNicknameGateViewModel } from '@/feature/meeting/hooks/useNicknameGateViewModel';

export interface NicknameGateProps extends UseNicknameGateViewModel {
  readonly code: string;
}

/**
 * 회의 링크로 직접 접속한(닉네임 없는) 사용자에게 보여주는 닉네임 입력 게이트 View.
 */
export function NicknameGate({ code, status, register, errors, handleSubmit }: NicknameGateProps) {
  const submitting = status === 'submitting';
  return (
    <div className="theme-dark bg-bg text-text relative flex h-screen items-center justify-center overflow-hidden">
      {/* 배경: 회의 화면 톤의 헤더 + 빈 영역 */}
      <div
        className="absolute inset-0 flex flex-col"
        aria-hidden="true"
      >
        <header className="border-border border-b px-5 py-3">
          <h1 className="text-text text-base font-semibold">회의 {code}</h1>
        </header>
        <div className="flex-1" />
      </div>

      {/* 닉네임 입력 모달 */}
      <div className="border-border bg-surface relative z-10 w-full max-w-sm rounded-2xl border p-6 shadow-xl">
        <h2 className="text-text text-lg font-bold">회의 입장</h2>
        <p className="text-muted mt-1 text-sm">닉네임을 입력하면 이 회의에 참여합니다.</p>
        <form
          aria-label="nickname-gate-form"
          onSubmit={handleSubmit}
          className="mt-4"
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
          {errors.nickname !== undefined && (
            <p
              role="alert"
              data-field="nickname"
              className="field-error"
            >
              {errors.nickname.message}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-4 w-full"
          >
            {submitting ? '입장 중…' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
