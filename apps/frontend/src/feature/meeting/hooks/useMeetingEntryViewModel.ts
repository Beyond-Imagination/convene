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
  /** 판정에 쓴 회의 정보. 제목·시작 시각을 회의 화면이 그대로 쓴다. */
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
 * 회의에 들어가도 되는지 소켓을 열기 전에 판정하는 ViewModel.
 *
 * 없는 회의·종료된 회의는 입장 요청 자체를 보내지 않는다. 판정이 끝날 때까지는
 * 회의 화면도 닉네임 입력도 띄우지 않아야 해서 'checking'을 별도 상태로 노출한다.
 */
export function useMeetingEntryViewModel(code: string): UseMeetingEntryViewModel {
  const card = useMeetingCardViewModel(code);
  return { state: stateOf(card), meeting: card.meeting };
}
