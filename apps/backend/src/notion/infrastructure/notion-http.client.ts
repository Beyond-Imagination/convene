import { NotionConfig } from '@/config/notion.config';

export interface NotionListPage {
  readonly results: ReadonlyArray<Record<string, unknown>>;
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

/**
 * 노션 REST가 2xx가 아닌 응답을 돌려줄 때 던지는 에러.
 */
export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    readonly notionCode: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

/**
 * 노션 REST API 저수준 클라이언트. SDK 없이 fetch로 직접 호출한다.
 */
export class NotionHttpClient {
  constructor(
    private readonly config: NotionConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async appendBlockChildren(
    blockId: string,
    children: ReadonlyArray<unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request('PATCH', `/blocks/${blockId}/children`, { children });
  }

  async getBlockChildren(blockId: string, startCursor?: string): Promise<NotionListPage> {
    const query = startCursor === undefined ? '' : `?start_cursor=${encodeURIComponent(startCursor)}`;
    return this.request<NotionListPage>('GET', `/blocks/${blockId}/children${query}`);
  }

  async queryDatabase(databaseId: string, body: unknown): Promise<NotionListPage> {
    return this.request<NotionListPage>('POST', `/databases/${databaseId}/query`, body);
  }

  async updatePageProperties(
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request('PATCH', `/pages/${pageId}`, { properties });
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Notion-Version': this.config.version,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        code?: unknown;
        message?: unknown;
      } | null;
      const code = typeof errorBody?.code === 'string' ? errorBody.code : null;
      const detail = typeof errorBody?.message === 'string' ? errorBody.message : response.statusText;
      throw new NotionApiError(response.status, code, `Notion API ${response.status}: ${detail}`);
    }

    return (await response.json()) as T;
  }
}
