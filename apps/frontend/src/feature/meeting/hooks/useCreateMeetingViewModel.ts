'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { createMeeting, MeetingApiError } from '@/shared/api/meeting.api';

/**
 * 홈 페이지 "회의 생성" 버튼의 ViewModel.
 *
 * View 컴포넌트는 본 hook 의 반환만으로 렌더링/액션을 수행한다(ARCHITECTURE §4).
 * 상태 머신은 `idle → submitting → (성공 시 navigation) | error` 3개로 단순화.
 *
 * v1 UX 는 닉네임/source 입력이 없는 "버튼 한 번 클릭"이라 react-hook-form 을
 * 사용하지 않는다. 향후 source/externalReference 분기가 필요해지면 본 hook 에서
 * useForm 을 합성한다.
 */

export type CreateMeetingStatus = 'idle' | 'submitting' | 'error';

export interface UseCreateMeetingViewModel {
  readonly status: CreateMeetingStatus;
  readonly errorMessage: string | null;
  readonly submit: () => Promise<void>;
}

const DEFAULT_ERROR_MESSAGE = '회의 생성에 실패했습니다.';

export function useCreateMeetingViewModel(): UseCreateMeetingViewModel {
  const router = useRouter();
  const [status, setStatus] = useState<CreateMeetingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setStatus('submitting');
    setErrorMessage(null);
    try {
      const res = await createMeeting({ source: 'web' });
      router.push(`/meetings/${res.code}`);
    } catch (e) {
      const message =
        e instanceof MeetingApiError && e.message ? e.message : DEFAULT_ERROR_MESSAGE;
      setErrorMessage(message);
      setStatus('error');
    }
  }, [router]);

  return { status, errorMessage, submit };
}
