import type { ReportDetailResponse } from '@convene/shared-interfaces';
import { renderHook, waitFor } from '@testing-library/react';

import { ReportsApiError } from '@/shared/api/reports.api';

import { useReportDetailViewModel } from './useReportDetailViewModel';

const getReportMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/reports.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/reports.api')>(
    '@/shared/api/reports.api',
  );
  return { ...actual, getReport: getReportMock };
});

const baseDetail = (overrides: Partial<ReportDetailResponse> = {}): ReportDetailResponse => ({
  id: 'r1',
  meetingId: 'm1',
  code: 'abc12xyz',
  source: 'web',
  externalReference: {},
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T01:00:00.000Z',
  participants: [],
  chat: [],
  transcript: [],
  summary: null,
  pipeline: { sttStatus: 'pending', summaryStatus: 'pending', failures: [] },
  pushedToNotion: null,
  ...overrides,
});

describe('useReportDetailViewModel', () => {
  beforeEach(() => {
    getReportMock.mockReset();
  });

  it('id가 빈 문자열이면 status="idle" 로 유지하고 getReport를 호출하지 않는다', () => {
    const { result } = renderHook(() => useReportDetailViewModel(''));
    expect(result.current.status).toBe('idle');
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('id가 있으면 mount 직후 status="loading" 으로 시작한다', () => {
    getReportMock.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useReportDetailViewModel('r1'));
    expect(result.current.status).toBe('loading');
  });

  it('getReport가 resolve 되면 status="loaded" + report가 채워진다', async () => {
    getReportMock.mockResolvedValueOnce(baseDetail({ id: 'r1' }));
    const { result } = renderHook(() => useReportDetailViewModel('r1'));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.report?.id).toBe('r1');
  });

  it('404 reject 시 status="not-found" 로 전환된다', async () => {
    getReportMock.mockRejectedValueOnce(new ReportsApiError(404, 'not found'));
    const { result } = renderHook(() => useReportDetailViewModel('missing'));
    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });

  it('기타 에러 reject 시 status="error" + errorMessage 노출', async () => {
    getReportMock.mockRejectedValueOnce(new ReportsApiError(500, 'mongo down'));
    const { result } = renderHook(() => useReportDetailViewModel('r1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('mongo down');
  });

  it('id가 바뀌면 새 id로 getReport가 다시 호출된다', async () => {
    getReportMock.mockResolvedValueOnce(baseDetail({ id: 'r1' }));
    const { result, rerender } = renderHook(({ id }) => useReportDetailViewModel(id), {
      initialProps: { id: 'r1' },
    });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    getReportMock.mockResolvedValueOnce(baseDetail({ id: 'r2' }));
    rerender({ id: 'r2' });
    await waitFor(() => expect(result.current.report?.id).toBe('r2'));
    expect(getReportMock).toHaveBeenNthCalledWith(1, 'r1');
    expect(getReportMock).toHaveBeenNthCalledWith(2, 'r2');
  });
});
