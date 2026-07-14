import { Test } from '@nestjs/testing';

import { NotionHttpClient } from './infrastructure/notion-http.client';
import { NOTION_CLIENT, NotionModule } from './notion.module';

describe('NotionModule', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  async function compileWith(env: Record<string, string>): Promise<NotionHttpClient | null> {
    process.env = { ...originalEnv, ...env };
    const ref = await Test.createTestingModule({ imports: [NotionModule] }).compile();
    return ref.get<NotionHttpClient | null>(NOTION_CLIENT);
  }

  it('NOTION_TOKEN이 없으면 노션 클라이언트를 null로 제공한다(dormant)', async () => {
    expect(await compileWith({ NOTION_TOKEN: '' })).toBeNull();
  });

  it('NOTION_TOKEN이 있으면 NotionHttpClient 인스턴스를 제공한다', async () => {
    expect(await compileWith({ NOTION_TOKEN: 't' })).toBeInstanceOf(NotionHttpClient);
  });
});
