'use client';

import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useState } from 'react';
import {
  type FieldErrors,
  useForm,
  type UseFormRegisterReturn,
} from 'react-hook-form';

import { createMeeting, MeetingApiError } from '@/shared/api/meeting.api';
import { saveHostToken } from '@/shared/stores/host-token.storage';
import { useSessionStore } from '@/shared/stores/session.store';

/**
 * 홈 페이지 "회의 만들기" 폼의 ViewModel.
 *
 * v1 의 회의 만들기는 닉네임 입력 1개를 받는다(JoinMeetingForm 의 닉네임 검증과
 * 동일 규칙). submit 성공 시:
 *   1) 닉네임을 session store 에 set
 *   2) POST /meetings 로 새 회의 코드 발급
 *   3) `/meetings/{code}` 로 router.push — useMeetingViewModel 이 store.nickname
 *      을 보고 정상 진입한다(닉네임 없으면 / 로 redirect 되던 문제 해결).
 *
 * 검증 규칙은 useJoinMeetingViewModel 과 일치 — 추후 zod 도입 시 공통화한다.
 */

export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 30;

export type CreateMeetingStatus = 'idle' | 'submitting' | 'error';

export interface CreateMeetingFormValues {
  nickname: string;
}

export interface UseCreateMeetingViewModel {
  readonly status: CreateMeetingStatus;
  readonly errorMessage: string | null;
  readonly register: (
    name: keyof CreateMeetingFormValues,
  ) => UseFormRegisterReturn;
  readonly errors: FieldErrors<CreateMeetingFormValues>;
  readonly handleSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}

const DEFAULT_ERROR_MESSAGE = '회의 생성에 실패했습니다.';

export function useCreateMeetingViewModel(): UseCreateMeetingViewModel {
  const router = useRouter();
  const setNickname = useSessionStore((s) => s.setNickname);
  const [status, setStatus] = useState<CreateMeetingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm<CreateMeetingFormValues>({
    defaultValues: { nickname: '' },
    mode: 'onSubmit',
  });

  const handleSubmit = rhfHandleSubmit(async (values) => {
    setStatus('submitting');
    setErrorMessage(null);
    const trimmed = values.nickname.trim();
    try {
      const res = await createMeeting({ source: 'web' });
      // 생성자는 host. 회의 종료 권한 식별용 토큰을 회의 code 로 보관한다.
      saveHostToken(res.code, res.hostToken);
      setNickname(trimmed);
      router.push(`/meetings/${res.code}`);
    } catch (e) {
      const message =
        e instanceof MeetingApiError && e.message
          ? e.message
          : DEFAULT_ERROR_MESSAGE;
      setErrorMessage(message);
      setStatus('error');
    }
  });

  const registerField: UseCreateMeetingViewModel['register'] = (name) => {
    if (name === 'nickname') {
      return register('nickname', {
        required: '닉네임을 입력하세요.',
        validate: (raw: string) => {
          const trimmed = raw.trim();
          if (trimmed.length < NICKNAME_MIN) return '닉네임을 입력하세요.';
          if (trimmed.length > NICKNAME_MAX) {
            return `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`;
          }
          return true;
        },
      });
    }
    return register(name);
  };

  return {
    status,
    errorMessage,
    register: registerField,
    errors,
    handleSubmit,
  };
}
