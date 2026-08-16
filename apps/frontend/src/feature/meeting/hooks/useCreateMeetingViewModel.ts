'use client';

import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useState } from 'react';
import { type FieldErrors, useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { createMeeting, MeetingApiError } from '@/shared/api/meeting.api';
import { getLastNickname, saveHostToken, saveLastNickname, saveNickname } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 30;

export type CreateMeetingStatus = 'idle' | 'submitting' | 'error';

export interface CreateMeetingFormValues {
  nickname: string;
  title: string;
}

export interface UseCreateMeetingViewModel {
  readonly status: CreateMeetingStatus;
  readonly errorMessage: string | null;
  readonly register: (name: keyof CreateMeetingFormValues) => UseFormRegisterReturn;
  readonly errors: FieldErrors<CreateMeetingFormValues>;
  readonly handleSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}

const DEFAULT_ERROR_MESSAGE = '회의 생성에 실패했습니다.';

/**
 * 홈 페이지 "회의 만들기" 폼의 ViewModel.
 * submit 성공 시:
 *   1) 닉네임을 session store에 set
 *   2) POST /meetings로 새 회의 코드 발급
 *   3) `/meetings/{code}`로 router.push — useMeetingViewModel이 store.nickname을 보고 정상 진입한다.
 */
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
    defaultValues: { nickname: getLastNickname(), title: '' },
    mode: 'onSubmit',
  });

  const handleSubmit = rhfHandleSubmit(async (values) => {
    setStatus('submitting');
    setErrorMessage(null);
    const trimmed = values.nickname.trim();
    const trimmedTitle = values.title.trim();
    try {
      const res = await createMeeting({
        source: 'web',
        // 비어 있으면 제목을 보내지 않는다(서버는 미지정으로 처리).
        title: trimmedTitle === '' ? undefined : trimmedTitle,
      });
      saveHostToken(res.code, res.hostToken);
      saveNickname(res.code, trimmed);
      saveLastNickname(trimmed);
      setNickname(trimmed);
      router.push(`/meetings/${res.code}`);
    } catch (e) {
      const message = e instanceof MeetingApiError && e.message ? e.message : DEFAULT_ERROR_MESSAGE;
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
