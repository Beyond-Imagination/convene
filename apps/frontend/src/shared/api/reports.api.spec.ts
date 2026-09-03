import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_BASE_URL } from './config';
import { getReport, listReports } from './reports.api';

const okResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const errorResponse = (status: number, text = ''): Response => new Response(text, { status });

describe('listReports', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const emptyPage = { number: 1, size: 20, totalItems: 0, totalPages: 0 };

  it('파라미터가 없으면 /reports로 GET 하고 응답을 그대로 반환한다', async () => {
    const body = { items: [], page: emptyPage };
    fetchMock.mockResolvedValueOnce(okResponse(body));
    const result = await listReports();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports`);
    expect(init).toMatchObject({ method: 'GET' });
    expect(result).toEqual(body);
  });

  it('page/size/sort는 쿼리스트링으로 붙는다', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [], page: emptyPage }));
    await listReports({ page: 2, size: 10, sort: 'latest' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports?page=2&size=10&sort=latest`);
  });

  it('지정한 파라미터만 쿼리에 붙는다', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [], page: emptyPage }));
    await listReports({ page: 3 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports?page=3`);
  });

  it('items와 페이지 메타를 그대로 돌려준다', async () => {
    const item = {
      id: 'r1',
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T01:00:00.000Z',
      participantCount: 3,
      pipeline: { sttStatus: 'done', summaryStatus: 'pending' },
      title: '주간 미팅',
      notionSynced: true,
    };
    const page = { number: 2, size: 20, totalItems: 43, totalPages: 3 };
    fetchMock.mockResolvedValueOnce(okResponse({ items: [item], page }));
    const result = await listReports({ page: 2 });
    expect(result.items).toEqual([item]);
    expect(result.page).toEqual(page);
  });

  it('비-2xx 응답이면 ReportsApiError를 status와 함께 던진다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'mongo down'));
    await expect(listReports()).rejects.toMatchObject({
      name: 'ReportsApiError',
      status: 500,
    });
  });
});

describe('getReport', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('id를 path에 박아 /reports/:id로 GET 한다', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
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
      }),
    );
    const result = await getReport('r1');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports/r1`);
    expect(result.id).toBe('r1');
  });

  it('404 면 ReportsApiError(status=404)를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404, 'not found'));
    await expect(getReport('missing')).rejects.toMatchObject({
      name: 'ReportsApiError',
      status: 404,
    });
  });
});
