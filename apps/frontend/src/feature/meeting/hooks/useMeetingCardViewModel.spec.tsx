import type { MeetingDetailResponse } from '@convene/shared-interfaces';
import { renderHook, waitFor } from '@testing-library/react';

import { MeetingApiError } from '@/shared/api/meeting.api';

import { useMeetingCardViewModel } from './useMeetingCardViewModel';

const { getMeetingMock } = vi.hoisted(() => ({ getMeetingMock: vi.fn() }));

vi.mock('@/shared/api/meeting.api', async (original) => {
  const actual = (await original()) as typeof import('@/shared/api/meeting.api');
  return {
    ...actual,
    getMeeting: (...args: Parameters<typeof actual.getMeeting>) => getMeetingMock(...args),
  };
});

const scheduled: MeetingDetailResponse = {
  code: 'abc12xyz',
  title: '스프린트 회고',
  status: 'scheduled',
  participantCount: 0,
  startedAt: null,
  endedAt: null,
};

describe('useMeetingCardViewModel', () => {
  beforeEach(() => getMeetingMock.mockReset());

  it('응답이 오기 전에는 loading', async () => {
    let settle!: (value: MeetingDetailResponse) => void;
    getMeetingMock.mockReturnValue(
      new Promise<MeetingDetailResponse>((resolve) => {
        settle = resolve;
      }),
    );

    const { result } = renderHook(() => useMeetingCardViewModel('abc12xyz'));
    expect(result.current.status).toBe('loading');
    expect(result.current.meeting).toBeNull();

    // pending인 채로 두면 테스트 러너가 종료되지 못한다.
    settle(scheduled);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('조회에 성공하면 회의 정보를 싣는다', async () => {
    getMeetingMock.mockResolvedValue(scheduled);
    const { result } = renderHook(() => useMeetingCardViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.meeting).toEqual(scheduled);
    expect(getMeetingMock).toHaveBeenCalledWith('abc12xyz');
  });

  it('없는 회의(404)는 not-found로 구분하고 회의 정보는 비운다', async () => {
    getMeetingMock.mockRejectedValueOnce(new MeetingApiError(404, 'not found'));
    const { result } = renderHook(() => useMeetingCardViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.status).toBe('not-found'));
    expect(result.current.meeting).toBeNull();
  });

  it('코드 형식이 틀리면(400) 존재할 수 없는 회의이므로 not-found', async () => {
    getMeetingMock.mockRejectedValueOnce(new MeetingApiError(400, 'bad code'));
    const { result } = renderHook(() => useMeetingCardViewModel('short'));
    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });

  it('조회 자체가 실패하면 error — 없는 회의로 단정하지 않는다', async () => {
    getMeetingMock.mockRejectedValueOnce(new MeetingApiError(500, 'boom'));
    const { result } = renderHook(() => useMeetingCardViewModel('abc12xyz'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.meeting).toBeNull();
  });
});
