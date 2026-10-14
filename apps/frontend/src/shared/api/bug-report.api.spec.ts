import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BugReportApiError, submitBugReport, uploadBugReportImage } from './bug-report.api';
import { API_BASE_URL } from './config';

const okJson = (body: unknown, status = 201): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('bug-report.api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('이미지는 multipart image 필드로 올리고 uploadId를 돌려준다', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ uploadId: 'fu-1' }));
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });

    expect(await uploadBugReportImage(file)).toBe('fu-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/bug-reports/images`);
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('image')).toBeInstanceOf(File);
  });

  it('본문은 JSON으로 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const request = { summary: 'x', locations: ['home' as const], steps: [], imageUploadIds: [] };

    await submitBugReport(request);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/bug-reports`);
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it('실패하면 상태 코드를 담은 BugReportApiError를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('too many', { status: 429 }));
    const error = await submitBugReport({
      summary: 'x',
      locations: ['home'],
      steps: [],
      imageUploadIds: [],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BugReportApiError);
    expect((error as BugReportApiError).status).toBe(429);
  });
});
