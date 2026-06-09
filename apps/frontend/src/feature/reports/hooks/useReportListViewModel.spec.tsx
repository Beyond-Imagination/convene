import type { ReportListItem } from '@convene/shared-interfaces';
import { renderHook, waitFor } from '@testing-library/react';

import { ReportsApiError } from '@/shared/api/reports.api';

import { useReportListViewModel } from './useReportListViewModel';

const listReportsMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/reports.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/reports.api')>(
    '@/shared/api/reports.api',
  );
  return { ...actual, listReports: listReportsMock };
});

const item = (overrides: Partial<ReportListItem> = {}): ReportListItem => ({
  id: 'r1',
  code: 'abc12xyz',
  source: 'web',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T01:00:00.000Z',
  participantCount: 2,
  pipeline: { sttStatus: 'done', summaryStatus: 'done' },
  title: '주간 미팅',
  ...overrides,
});

describe('useReportListViewModel', () => {
  beforeEach(() => {
    listReportsMock.mockReset();
  });

  it('mount 직후 status="loading" 으로 시작한다', () => {
    listReportsMock.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useReportListViewModel());
    expect(result.current.status).toBe('loading');
    expect(result.current.items).toEqual([]);
  });

  it('listReports가 resolve 되면 status="loaded" + items가 채워진다', async () => {
    listReportsMock.mockResolvedValueOnce([item({ id: 'r1' }), item({ id: 'r2' })]);
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.items.map((i) => i.id)).toEqual(['r1', 'r2']);
    expect(result.current.errorMessage).toBeNull();
  });

  it('listReports가 reject 되면 status="error" + errorMessage 노출', async () => {
    listReportsMock.mockRejectedValueOnce(new ReportsApiError(500, 'mongo down'));
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('mongo down');
  });

  it('refresh() 호출 시 listReports가 다시 호출되고 items가 갱신된다', async () => {
    listReportsMock.mockResolvedValueOnce([item({ id: 'r1' })]);
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    listReportsMock.mockResolvedValueOnce([item({ id: 'r2' })]);
    await result.current.refresh();
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['r2']));
    expect(listReportsMock).toHaveBeenCalledTimes(2);
  });
});
