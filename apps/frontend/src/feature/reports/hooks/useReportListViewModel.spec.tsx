import type { PageMetaWire, ReportListItem, ReportListResponse } from '@convene/shared-interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';

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
  notionSynced: false,
  ...overrides,
});

const response = (
  items: ReportListItem[],
  page: Partial<PageMetaWire> = {},
): ReportListResponse => ({
  items,
  page: { number: 1, size: 20, totalItems: items.length, totalPages: 1, ...page },
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

  it('mount 시 첫 페이지를 요청한다', async () => {
    listReportsMock.mockResolvedValueOnce(response([item()]));
    renderHook(() => useReportListViewModel());
    await waitFor(() => expect(listReportsMock).toHaveBeenCalledWith({ page: 1 }));
  });

  it('listReports가 resolve 되면 items와 페이지 메타가 채워진다', async () => {
    listReportsMock.mockResolvedValueOnce(
      response([item({ id: 'r1' }), item({ id: 'r2' })], { totalItems: 43, totalPages: 3 }),
    );
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.items.map((i) => i.id)).toEqual(['r1', 'r2']);
    expect(result.current.page).toEqual({
      number: 1,
      size: 20,
      totalItems: 43,
      totalPages: 3,
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('listReports가 reject 되면 status="error" + errorMessage 노출', async () => {
    listReportsMock.mockRejectedValueOnce(new ReportsApiError(500, 'mongo down'));
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('mongo down');
  });

  it('goToPage(n)이면 그 페이지를 다시 요청하고 목록을 갈아끼운다', async () => {
    listReportsMock.mockResolvedValueOnce(response([item({ id: 'r1' })], { totalPages: 3 }));
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    listReportsMock.mockResolvedValueOnce(
      response([item({ id: 'r21' })], { number: 2, totalPages: 3 }),
    );
    act(() => {
      result.current.goToPage(2);
    });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['r21']));
    expect(listReportsMock).toHaveBeenLastCalledWith({ page: 2 });
    expect(result.current.page.number).toBe(2);
  });

  it('goToPage는 1보다 작은 페이지로 내려가지 않는다', async () => {
    listReportsMock.mockResolvedValue(response([item()]));
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => {
      result.current.goToPage(0);
    });

    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(listReportsMock).toHaveBeenLastCalledWith({ page: 1 });
  });

  it('refresh()는 현재 페이지를 다시 불러온다', async () => {
    listReportsMock.mockResolvedValueOnce(response([item({ id: 'r1' })]));
    const { result } = renderHook(() => useReportListViewModel());
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    listReportsMock.mockResolvedValueOnce(response([item({ id: 'r2' })]));
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['r2']));
    expect(listReportsMock).toHaveBeenCalledTimes(2);
  });
});
