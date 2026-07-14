import { Module } from '@nestjs/common';

import { resolveNotionConfig } from '@/config/notion.config';

import { NotionHttpClient } from './infrastructure/notion-http.client';

export const NOTION_CLIENT = Symbol('NOTION_CLIENT');

@Module({
  providers: [
    {
      provide: NOTION_CLIENT,
      useFactory: (): NotionHttpClient | null => {
        const config = resolveNotionConfig();
        return config === null ? null : new NotionHttpClient(config);
      },
    },
  ],
  exports: [NOTION_CLIENT],
})
export class NotionModule {}
