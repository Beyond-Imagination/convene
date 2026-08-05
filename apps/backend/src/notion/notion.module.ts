import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveNotionConfig } from '@/config/notion.config';
import { resolveCorsOrigins } from '@/config/server.config';
import { MeetingModule } from '@/meeting/meeting.module';
import {
  MEETING_LINK_BASE,
  NotionMeetingProvisioningService,
} from '@/notion/application/notion-meeting-provisioning.service';
import { NotionPollingScheduler } from '@/notion/application/notion-polling.scheduler';
import { NotionReportListener } from '@/notion/application/notion-report.listener';
import { NotionReportPushService } from '@/notion/application/notion-report-push.service';
import { NOTION_ISSUE } from '@/notion/domain/ports/notion-issue.port';
import { NOTION_REPORT } from '@/notion/domain/ports/notion-report.port';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { NotionIssueAdapter } from '@/notion/infrastructure/notion-issue.adapter';
import { NotionReportAdapter } from '@/notion/infrastructure/notion-report.adapter';
import { NotionMeetingsController } from '@/notion/interface/notion-meetings.controller';
import { NotionSignatureVerifier } from '@/notion/interface/notion-signature';
import { ReportsModule } from '@/reports/reports.module';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

export const NOTION_CLIENT = Symbol('NOTION_CLIENT');

/**
 * env gate에 따라 조각을 조건부 등록한다(prod-safe): 토큰→provisioning + 회의록 push 코어,
 * +서명 시크릿→즉시 경로 컨트롤러, +DB id→폴링 스케줄러.
 * register()는 메타데이터 평가 시점 process.env를 읽으므로 운영 env 주입으로만 켜진다.
 */
@Module({})
export class NotionModule {
  static register(): DynamicModule {
    const config = resolveNotionConfig();

    const clientProvider: Provider = {
      provide: NOTION_CLIENT,
      useFactory: (): NotionHttpClient | null =>
        config === null ? null : new NotionHttpClient(config),
    };

    if (config === null) {
      return { module: NotionModule, providers: [clientProvider], exports: [NOTION_CLIENT] };
    }

    const { databaseIds, signingSecret } = config;
    // 링크 베이스 = 프론트 오리진. 별도 env 중복 관리를 피해 CORS_ORIGIN에서 파생한다.
    const meetingLinkBase = resolveCorsOrigins()[0];
    const providers: Provider[] = [
      clientProvider,
      NotionMeetingProvisioningService,
      NotionReportPushService,
      NotionReportListener,
      { provide: MEETING_LINK_BASE, useValue: meetingLinkBase },
      {
        // databaseIds가 register() 시점 env에서 오므로 동적 생성이 필요하다.
        provide: NOTION_ISSUE,
        useFactory: (client: NotionHttpClient, logger: PinoLogger) =>
          new NotionIssueAdapter(
            client,
            databaseIds,
            new PinoLoggerAdapter(logger, NotionIssueAdapter.name),
            meetingLinkBase,
          ),
        inject: [NOTION_CLIENT, PinoLogger],
      },
      {
        provide: NOTION_REPORT,
        useFactory: (client: NotionHttpClient) => new NotionReportAdapter(client),
        inject: [NOTION_CLIENT],
      },
    ];
    const controllers: Type<unknown>[] = [];
    const imports: DynamicModule['imports'] = [MeetingModule, ReportsModule];

    if (signingSecret !== null) {
      providers.push({
        provide: NotionSignatureVerifier,
        useFactory: () => new NotionSignatureVerifier(signingSecret),
      });
      controllers.push(NotionMeetingsController);
    }

    if (databaseIds.length > 0) {
      // ScheduleModule.forRoot()는 AppModule 루트에 있다. 여기선 스케줄러 provider만 등록하면
      // 루트의 SchedulerExplorer가 @Cron을 감지해 스케줄한다.
      providers.push(NotionPollingScheduler);
    }

    return { module: NotionModule, imports, controllers, providers, exports: [NOTION_CLIENT] };
  }
}
