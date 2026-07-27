import { Test } from '@nestjs/testing';

import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionPollingScheduler } from '@/notion/application/notion-polling.scheduler';
import { NotionReportListener } from '@/notion/application/notion-report.listener';
import { NotionReportPushService } from '@/notion/application/notion-report-push.service';
import { NotionMeetingsController } from '@/notion/interface/notion-meetings.controller';

import { NotionHttpClient } from './infrastructure/notion-http.client';
import { NOTION_CLIENT, NotionModule } from './notion.module';

describe('NotionModule.register (gate)', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function registerWith(env: Record<string, string>): ReturnType<typeof NotionModule.register> {
    process.env = { ...originalEnv, ...env };
    return NotionModule.register();
  }

  function providerTokens(module: ReturnType<typeof NotionModule.register>): unknown[] {
    return (module.providers ?? []).map((p) => (typeof p === 'object' && 'provide' in p ? p.provide : p));
  }

  // 토큰 없음 분기는 dormant라 MeetingModule 없이 DI 컴파일이 가능하다.
  it('NOTION_TOKEN이 없으면 NOTION_CLIENT를 null로만 제공(완전 dormant)', async () => {
    const module = registerWith({ NOTION_TOKEN: '' });
    expect(module.controllers ?? []).toEqual([]);
    expect(providerTokens(module)).toEqual([NOTION_CLIENT]);

    const ref = await Test.createTestingModule({ imports: [module] }).compile();
    expect(ref.get<NotionHttpClient | null>(NOTION_CLIENT)).toBeNull();
  });

  it('토큰만 있으면 provisioning 코어는 등록하되 컨트롤러·스케줄러는 미등록', () => {
    const module = registerWith({ NOTION_TOKEN: 't' });
    expect(module.controllers ?? []).toEqual([]);
    expect(providerTokens(module)).toContain(NotionMeetingProvisioningService);
    expect(providerTokens(module)).not.toContain(NotionPollingScheduler);
  });

  it('토큰만 있어도 회의록 노션 삽입(report.finalized 구독) 조각은 등록한다', () => {
    const module = registerWith({ NOTION_TOKEN: 't' });
    expect(providerTokens(module)).toEqual(
      expect.arrayContaining([NotionReportPushService, NotionReportListener]),
    );
  });

  it('서명 시크릿이 있으면 즉시 경로 컨트롤러를 등록한다(링크 베이스는 CORS_ORIGIN 파생)', () => {
    const module = registerWith({ NOTION_TOKEN: 't', NOTION_SIGNING_SECRET: 's' });
    expect(module.controllers).toContain(NotionMeetingsController);
  });

  it('서명 시크릿이 없으면 즉시 경로 컨트롤러를 등록하지 않는다', () => {
    const module = registerWith({ NOTION_TOKEN: 't', NOTION_DB_IDS: 'db1' });
    expect(module.controllers ?? []).not.toContain(NotionMeetingsController);
  });

  it('DB id가 있으면 폴링 스케줄러를 등록한다', () => {
    const module = registerWith({ NOTION_TOKEN: 't', NOTION_DB_IDS: 'db1,db2' });
    expect(providerTokens(module)).toContain(NotionPollingScheduler);
  });

  it('DB id가 없으면 폴링 스케줄러를 등록하지 않는다', () => {
    const module = registerWith({ NOTION_TOKEN: 't', NOTION_SIGNING_SECRET: 's' });
    expect(providerTokens(module)).not.toContain(NotionPollingScheduler);
  });
});
