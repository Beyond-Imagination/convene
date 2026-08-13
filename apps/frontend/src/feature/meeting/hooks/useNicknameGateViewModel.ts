'use client';

import { type BaseSyntheticEvent, useState } from 'react';
import { type FieldErrors, useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { getLastNickname, saveLastNickname, saveNickname } from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 30;

export type NicknameGateStatus = 'idle' | 'submitting';

export interface NicknameGateFormValues {
  nickname: string;
}

export interface UseNicknameGateViewModel {
  readonly status: NicknameGateStatus;
  readonly register: (name: keyof NicknameGateFormValues) => UseFormRegisterReturn;
  readonly errors: FieldErrors<NicknameGateFormValues>;
  readonly handleSubmit: (e?: BaseSyntheticEvent) => Promise<void>;
}

/**
 * 회의 링크로 직접 접속한(닉네임 없는) 사용자가 회의 페이지에서 닉네임을 입력해 입장하도록 하는 닉네임 게이트의 ViewModel.
 *
 * 회의 코드는 URL에서 이미 정해지므로 닉네임만 받는다.
 * submit 성공 시 session store에 닉네임을 set 하면, `useMeetingViewModel`이 그 nickname을 보고 socket을 만들어 정상 입장한다.
 */
export function useNicknameGateViewModel(code: string): UseNicknameGateViewModel {
  const setNickname = useSessionStore((s) => s.setNickname);
  const [status, setStatus] = useState<NicknameGateStatus>('idle');

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
  } = useForm<NicknameGateFormValues>({
    defaultValues: { nickname: getLastNickname() },
    mode: 'onSubmit',
  });

  const handleSubmit = rhfHandleSubmit((values) => {
    setStatus('submitting');
    const trimmed = values.nickname.trim();
    // store에만 넣으면 새로고침 한 번에 게이트로 되돌아간다.
    saveNickname(code, trimmed);
    saveLastNickname(trimmed);
    setNickname(trimmed);
  });

  const registerField: UseNicknameGateViewModel['register'] = (name) =>
    register(name, {
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

  return { status, register: registerField, errors, handleSubmit };
}
