import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveNotionConfig } from '@/config/notion.config';
import { resolveCorsOrigins } from '@/config/server.config';
import { MeetingModule } from '@/meeting/meeting.module';
import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionPollingScheduler } from '@/notion/application/notion-polling.scheduler';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { NotionIssueAdapter } from '@/notion/infrastructure/notion-issue.adapter';
import { NotionMeetingsController } from '@/notion/interface/notion-meetings.controller';
import { NotionSignatureVerifier } from '@/notion/interface/notion-signature';
import { MEETING_CREATION_PORT, MeetingCreationPort } from '@/shared-kernel/domain/ports';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

export const NOTION_CLIENT = Symbol('NOTION_CLIENT');

/**
 * env gate에 따라 조각을 조건부 등록한다(prod-safe): 토큰→provisioning 코어,
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
      {
        provide: NotionMeetingProvisioningService,
        useFactory: (
          client: NotionHttpClient,
          meetingCreation: MeetingCreationPort,
          logger: PinoLogger,
        ) =>
          new NotionMeetingProvisioningService({
            meetingCreation,
            notionIssue: new NotionIssueAdapter(
              client,
              databaseIds,
              new PinoLoggerAdapter(logger, NotionIssueAdapter.name),
            ),
            meetingLinkBase,
            logger: new PinoLoggerAdapter(logger, NotionMeetingProvisioningService.name),
          }),
        inject: [NOTION_CLIENT, MEETING_CREATION_PORT, PinoLogger],
      },
    ];
    const controllers: Type<unknown>[] = [];
    const imports: DynamicModule['imports'] = [MeetingModule];

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
      providers.push({
        provide: NotionPollingScheduler,
        useFactory: (
          provisioning: NotionMeetingProvisioningService,
          clock: SystemClock,
          logger: PinoLogger,
        ) =>
          new NotionPollingScheduler(
            provisioning,
            clock,
            new PinoLoggerAdapter(logger, NotionPollingScheduler.name),
          ),
        inject: [NotionMeetingProvisioningService, SystemClock, PinoLogger],
      });
    }

    return { module: NotionModule, imports, controllers, providers, exports: [NOTION_CLIENT] };
  }
}
