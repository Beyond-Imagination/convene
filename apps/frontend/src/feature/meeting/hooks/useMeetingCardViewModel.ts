'use client';

import type { MeetingDetailResponse } from '@convene/shared-interfaces';
import { useEffect, useState } from 'react';

import { getMeeting, MeetingApiError } from '@/shared/api/meeting.api';

export type MeetingCardStatus = 'loading' | 'ready' | 'not-found' | 'error';

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
      } catch (e) {
        const notFound = e instanceof MeetingApiError && (e.status === 404 || e.status === 400);
        if (!cancelled) setState({ status: notFound ? 'not-found' : 'error', meeting: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return state;
}
