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
  readonly meeting: MeetingDetailResponse | null;
}

const stateOf = ({ status, meeting }: UseMeetingCardViewModel): MeetingEntryState => {
  if (status === 'loading') return 'checking';
  if (status === 'not-found') return 'not-found';
  if (status === 'error' || meeting === null) return 'failed';
  return meeting.status === 'closed' ? 'closed' : 'ready';
};

export function useMeetingEntryViewModel(code: string): UseMeetingEntryViewModel {
  const card = useMeetingCardViewModel(code);
  return { state: stateOf(card), meeting: card.meeting };
}
