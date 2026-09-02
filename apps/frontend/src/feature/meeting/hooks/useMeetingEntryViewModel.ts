'use client';

import type { MeetingDetailResponse } from '@convene/shared-interfaces';

import {
  type UseMeetingCardViewModel,
  useMeetingCardViewModel,
} from '@/feature/meeting/hooks/useMeetingCardViewModel';
import type { MeetingEntryBlock } from '@/feature/meeting/hooks/useMeetingViewModel';

export type MeetingEntryState = 'checking' | 'ready' | MeetingEntryBlock;

export interface UseMeetingEntryViewModel {
  readonly state: MeetingEntryState;
  /** 판정에 쓴 회의 정보. 회의 화면이 제목·시작 시각으로 재사용한다. */
  readonly meeting: MeetingDetailResponse | null;
}

const stateOf = ({ status, meeting }: UseMeetingCardViewModel): MeetingEntryState => {
  if (status === 'loading') return 'checking';
  if (status === 'not-found') return 'not-found';
  // 조회가 실패했으면 회의가 없다고 단정할 수 없다. 다만 들여보낼 수도 없다.
  if (status === 'error' || meeting === null) return 'failed';
  // 예약 회의는 첫 참가자가 방을 여는 정상 입장 경로다.
  return meeting.status === 'closed' ? 'closed' : 'ready';
};

/**
 * 소켓을 열기 전에 입장 가능 여부를 판정하는 ViewModel.
 * 판정이 끝날 때까지는 회의 화면도 닉네임 입력도 띄우지 않아야 해서 'checking'을 따로 노출한다.
 */
export function useMeetingEntryViewModel(code: string): UseMeetingEntryViewModel {
  const card = useMeetingCardViewModel(code);
  return { state: stateOf(card), meeting: card.meeting };
}
