'use client';

import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useState } from 'react';
import { type FieldErrors, useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { getLastNickname, saveLastNickname, saveNickname } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

export const MEETING_CODE_PATTERN = /^[a-z0-9]{8}$/;
export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 30;

export type JoinMeetingStatus = 'idle' | 'submitting';

export interface JoinMeetingFormValues {
  code: string;
  nickname: string;
}

export interface UseJoinMeetingViewModel {
  readonly status: JoinMeetingStatus;
  /**
   * View가 input에 spread 하는 register helper.
   */
  readonly register: (name: keyof JoinMeetingFormValues) => UseFormRegisterReturn;
  readonly errors: FieldErrors<JoinMeetingFormValues>;
  readonly handleSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}

/**
 * 홈 페이지 "회의 입장" 폼의 ViewModel.
 *
 * 폼 입력 2종(code, nickname)을 react-hook-form으로 검증하고, 통과 시 닉네임을 ession store에 저장한 뒤 `/meetings/[code]`로 이동한다.
 * View는 본 hook의 반환만으로 input/submit/error 표시를 수행한다.
 */
export function useJoinMeetingViewModel(): UseJoinMeetingViewModel {
  const router = useRouter();
  const setNickname = useSessionStore((s) => s.setNickname);
  const [status, setStatus] = useState<JoinMeetingStatus>('idle');

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm<JoinMeetingFormValues>({
    defaultValues: { code: '', nickname: getLastNickname() },
    mode: 'onSubmit',
  });

  const handleSubmit = rhfHandleSubmit((values) => {
    setStatus('submitting');
    const trimmed = values.nickname.trim();
    // 닉네임을 code 별로 보관(리로드 생존) + reactive store에도 set.
    saveNickname(values.code, trimmed);
    saveLastNickname(trimmed);
    setNickname(trimmed);
    router.push(`/meetings/${values.code}`);
  });

  const registerField: UseJoinMeetingViewModel['register'] = (name) => {
    if (name === 'code') {
      return register('code', {
        required: '회의 코드를 입력하세요.',
        pattern: {
          value: MEETING_CODE_PATTERN,
          message: '회의 코드는 8자 소문자 영숫자입니다.',
        },
      });
    }
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
  };

  return { status, register: registerField, errors, handleSubmit };
}
