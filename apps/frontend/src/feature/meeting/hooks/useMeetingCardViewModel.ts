'use client';

import type { MeetingDetailResponse } from '@convene/shared-interfaces';
import { useEffect, useState } from 'react';

import { getMeeting } from '@/shared/api/meeting.api';

export type MeetingCardStatus = 'loading' | 'ready' | 'error';

export interface UseMeetingCardViewModel {
  readonly status: MeetingCardStatus;
  readonly meeting: MeetingDetailResponse | null;
}

const LOADING: UseMeetingCardViewModel = { status: 'loading', meeting: null };

/** 입장하지 않고 회의 상태만 읽어온다. 임베드 카드처럼 "들어가기 전 화면"이 쓴다. */
export function useMeetingCardViewModel(code: string): UseMeetingCardViewModel {
  const [state, setState] = useState<UseMeetingCardViewModel>(LOADING);

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);
    void (async () => {
      try {
        const meeting = await getMeeting(code);
        if (!cancelled) setState({ status: 'ready', meeting });
      } catch {
        // 없는 회의(404)와 네트워크 실패를 구분하지 않는다. 어느 쪽이든 입장시킬 수 없다.
        if (!cancelled) setState({ status: 'error', meeting: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return state;
}
