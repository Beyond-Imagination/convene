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

  it('limit 인자가 없으면 /reports로 GET 하고 items를 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [] }));
    const result = await listReports();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports`);
    expect(init).toMatchObject({ method: 'GET' });
    expect(result).toEqual([]);
  });

  it('limit 인자가 있으면 ?limit= 쿼리를 붙여 GET 한다', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [] }));
    await listReports({ limit: 10 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/reports?limit=10`);
  });

  it('items 배열을 그대로 풀어 ReportListItem[]으로 반환한다', async () => {
    const item = {
      id: 'r1',
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T01:00:00.000Z',
      participantCount: 3,
      pipeline: { sttStatus: 'done', summaryStatus: 'pending' },
      title: '주간 미팅',
    };
    fetchMock.mockResolvedValueOnce(okResponse({ items: [item] }));
    const result = await listReports();
    expect(result).toEqual([item]);
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
