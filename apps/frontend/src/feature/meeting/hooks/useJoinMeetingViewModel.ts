'use client';

import { useRouter } from 'next/navigation';
import { type BaseSyntheticEvent, useState } from 'react';
import { type FieldErrors, useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { getMeeting, MeetingApiError } from '@/shared/api/meeting.api';
import { getLastNickname, saveLastNickname, saveNickname } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

export const MEETING_CODE_PATTERN = /^[a-z0-9]{8}$/;
export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 30;

export type JoinMeetingStatus = 'idle' | 'submitting' | 'error';

const NOT_FOUND_MESSAGE = '존재하지 않는 회의 코드입니다.';
const CLOSED_MESSAGE = '이미 종료된 회의입니다.';
const LOOKUP_FAILED_MESSAGE = '회의 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export interface JoinMeetingFormValues {
  code: string;
  nickname: string;
}

export interface UseJoinMeetingViewModel {
  readonly status: JoinMeetingStatus;
  readonly errorMessage: string | null;
  /**
   * View가 input에 spread 하는 register helper.
   */
  readonly register: (name: keyof JoinMeetingFormValues) => UseFormRegisterReturn;
  readonly errors: FieldErrors<JoinMeetingFormValues>;
  readonly handleSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}

async function lookupBlockReason(code: string): Promise<string | null> {
  try {
    const meeting = await getMeeting(code);
    return meeting.status === 'closed' ? CLOSED_MESSAGE : null;
  } catch (e) {
    return e instanceof MeetingApiError && e.status === 404
      ? NOT_FOUND_MESSAGE
      : LOOKUP_FAILED_MESSAGE;
  }
}

/**
 * 홈 페이지 "회의 입장" 폼의 ViewModel.
 *
 * 폼 입력 2종(code, nickname)을 검증하고 회의가 실재하며 열려 있는지 확인한 뒤에야
 * 닉네임을 session store에 저장하고 `/meetings/[code]`로 이동한다 — 없는 회의는 이동 자체를 막는다.
 * View는 본 hook의 반환만으로 input/submit/error 표시를 수행한다.
 */
export function useJoinMeetingViewModel(): UseJoinMeetingViewModel {
  const router = useRouter();
  const setNickname = useSessionStore((s) => s.setNickname);
  const [status, setStatus] = useState<JoinMeetingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm<JoinMeetingFormValues>({
    defaultValues: { code: '', nickname: getLastNickname() },
    mode: 'onSubmit',
  });

  const handleSubmit = rhfHandleSubmit(async (values) => {
    setStatus('submitting');
    setErrorMessage(null);
    const blocked = await lookupBlockReason(values.code);
    if (blocked !== null) {
      setErrorMessage(blocked);
      setStatus('error');
      return;
    }
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

  return { status, errorMessage, register: registerField, errors, handleSubmit };
}
