import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_BASE_URL } from './config';
import { closeMeeting, createMeeting, MeetingApiError } from './meeting.api';

const okResponse = (body: unknown, init: ResponseInit = { status: 201 }): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json' },
  });

const errorResponse = (status: number, text: string): Response =>
  new Response(text, { status });

describe('createMeeting', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('source 만 보내는 정상 요청은 wire format 그대로 JSON body 로 POST 한다', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        code: 'abc12xyz',
        source: 'web',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const result = await createMeeting({ source: 'web' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/meetings`);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(init.body as string)).toEqual({ source: 'web' });
    expect(result).toEqual({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('externalReference 가 있으면 body 에 그대로 포함시킨다', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        code: 'xyz99aaa',
        source: 'notion-issue',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    await createMeeting({
      source: 'notion-issue',
      externalReference: { issueId: 'NTN-7' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      source: 'notion-issue',
      externalReference: { issueId: 'NTN-7' },
    });
  });

  it('비-2xx 응답이면 MeetingApiError 를 status 와 함께 던진다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(400, 'invalid source'));
    await expect(createMeeting({ source: 'web' })).rejects.toMatchObject({
      name: 'MeetingApiError',
      status: 400,
    });
  });

  it('응답 body 가 비어 있어도 MeetingApiError 메시지를 만들어 던진다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, ''));
    await expect(createMeeting({ source: 'web' })).rejects.toThrow(MeetingApiError);
  });
});

describe('closeMeeting', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETE {API_BASE_URL}/meetings/:code 로 호출한다', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        { code: 'abc12xyz', endedAt: '2026-01-01T00:30:00.000Z' },
        { status: 200 },
      ),
    );

    await closeMeeting('abc12xyz');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/meetings/abc12xyz`);
    expect(init).toMatchObject({ method: 'DELETE' });
  });

  it('응답을 CloseMeetingResponse 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        { code: 'abc12xyz', endedAt: '2026-01-01T00:30:00.000Z' },
        { status: 200 },
      ),
    );

    const result = await closeMeeting('abc12xyz');
    expect(result).toEqual({
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    });
  });

  it('비-2xx 응답이면 MeetingApiError 를 status 와 함께 던진다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404, 'meeting not found'));
    await expect(closeMeeting('zzz99zzz')).rejects.toMatchObject({
      name: 'MeetingApiError',
      status: 404,
    });
  });

  it('이미 종료된 회의(500 already closed)도 MeetingApiError 로 매핑한다', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'Meeting is already closed'));
    await expect(closeMeeting('abc12xyz')).rejects.toMatchObject({
      name: 'MeetingApiError',
      status: 500,
    });
  });
});
