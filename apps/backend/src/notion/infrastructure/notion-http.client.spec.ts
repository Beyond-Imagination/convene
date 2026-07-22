import { NotionConfig } from '@/config/notion.config';

import { NotionApiError, NotionHttpClient } from './notion-http.client';

const config: NotionConfig = {
  token: 'secret-token',
  version: '2025-09-03',
  baseUrl: 'https://api.notion.com',
  timeoutMs: 30_000,
  databaseIds: [],
  signingSecret: null,
};

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function errResponse(status: number, body: unknown): Response {
  return { ok: false, status, statusText: 'err', json: async () => body } as unknown as Response;
}

function makeClient(fetchFn: jest.Mock): NotionHttpClient {
  return new NotionHttpClient(config, fetchFn as unknown as typeof fetch);
}

describe('NotionHttpClient', () => {
  it('공통 헤더(Authorization/Notion-Version/Content-Type)를 붙여 호출한다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({}));
    await makeClient(fetchFn).updatePageProperties('page-1', {});
    const init = fetchFn.mock.calls[0][1];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    });
  });

  it('appendBlockChildren는 PATCH /v1/blocks/{id}/children 로 children을 보낸다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({}));
    const children = [{ type: 'paragraph', paragraph: { rich_text: [] } }];
    await makeClient(fetchFn).appendBlockChildren('block-1', children);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/blocks/block-1/children');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ children });
  });

  it('getBlockChildren는 GET /v1/blocks/{id}/children 이고 start_cursor를 쿼리로 붙인다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({ results: [], has_more: false, next_cursor: null }));
    await makeClient(fetchFn).getBlockChildren('block-1', 'cur-1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/blocks/block-1/children?start_cursor=cur-1');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('getBlockChildren는 start_cursor가 없으면 쿼리를 붙이지 않는다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({ results: [], has_more: false, next_cursor: null }));
    await makeClient(fetchFn).getBlockChildren('block-1');
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.notion.com/v1/blocks/block-1/children');
  });

  it('retrieveDatabase는 GET /v1/databases/{id} 로 data source 목록을 조회한다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({ data_sources: [{ id: 'ds-1' }] }));
    await makeClient(fetchFn).retrieveDatabase('db-1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/databases/db-1');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('queryDataSource는 POST /v1/data_sources/{id}/query 로 body를 보낸다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({ results: [], has_more: false, next_cursor: null }));
    const body = { filter: { property: '유형', multi_select: { contains: '회의' } } };
    await makeClient(fetchFn).queryDataSource('ds-1', body);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/data_sources/ds-1/query');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('updatePageProperties는 PATCH /v1/pages/{id} 로 properties를 감싸 보낸다', async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({}));
    const properties = { '회의 링크': { type: 'url', url: 'https://x' } };
    await makeClient(fetchFn).updatePageProperties('page-1', properties);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/pages/page-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ properties });
  });

  it('2xx가 아니면 status와 notion code를 담은 NotionApiError를 던진다', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(errResponse(403, { code: 'restricted_resource', message: 'no access' }));
    const client = makeClient(fetchFn);
    const error = await client.updatePageProperties('p', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotionApiError);
    expect((error as NotionApiError).status).toBe(403);
    expect((error as NotionApiError).notionCode).toBe('restricted_resource');
  });

  it('성공 응답 본문(JSON)을 그대로 돌려준다', async () => {
    const payload = { results: [{ id: 'p1' }], has_more: false, next_cursor: null };
    const fetchFn = jest.fn().mockResolvedValue(okResponse(payload));
    await expect(makeClient(fetchFn).queryDataSource('ds-1', {})).resolves.toEqual(payload);
  });
});
