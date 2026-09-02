import type { MeetingDetailResponse } from '@convene/shared-interfaces';
import { renderHook, waitFor } from '@testing-library/react';

import { MeetingApiError } from '@/shared/api/meeting.api';

import { useMeetingEntryViewModel } from './useMeetingEntryViewModel';

const { getMeetingMock } = vi.hoisted(() => ({ getMeetingMock: vi.fn() }));
vi.mock('@/shared/api/meeting.api', async (original) => {
  const actual = (await original()) as typeof import('@/shared/api/meeting.api');
  return {
    ...actual,
    getMeeting: (...args: Parameters<typeof actual.getMeeting>) => getMeetingMock(...args),
  };
});

const meeting = (over: Partial<MeetingDetailResponse> = {}): MeetingDetailResponse => ({
  code: 'abc12xyz',
  title: '스프린트 회고',
  status: 'open',
  participantCount: 1,
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: null,
  ...over,
});

describe('useMeetingEntryViewModel', () => {
  beforeEach(() => getMeetingMock.mockReset());

  it('판정이 끝나기 전에는 checking', async () => {
    let settle!: (value: MeetingDetailResponse) => void;
    getMeetingMock.mockReturnValue(
      new Promise<MeetingDetailResponse>((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    expect(result.current.state).toBe('checking');

    settle(meeting());
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  it('열린 회의는 ready이고 회의 정보를 함께 돌려준다', async () => {
    getMeetingMock.mockResolvedValue(meeting());
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.meeting?.title).toBe('스프린트 회고');
  });

  it('예약 회의도 입장할 수 있다 (첫 참가자가 방을 연다)', async () => {
    getMeetingMock.mockResolvedValue(meeting({ status: 'scheduled', startedAt: null }));
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
  });

  it('종료된 회의는 closed로 막는다', async () => {
    getMeetingMock.mockResolvedValue(
      meeting({ status: 'closed', endedAt: '2026-01-01T01:00:00.000Z' }),
    );
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.state).toBe('closed'));
  });

  it('없는 회의는 not-found로 막는다', async () => {
    getMeetingMock.mockRejectedValueOnce(new MeetingApiError(404, 'not found'));
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.state).toBe('not-found'));
  });

  it('조회 실패는 없는 회의로 단정하지 않고 failed로 둔다', async () => {
    getMeetingMock.mockRejectedValueOnce(new MeetingApiError(500, 'boom'));
    const { result } = renderHook(() => useMeetingEntryViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.state).toBe('failed'));
  });
});
