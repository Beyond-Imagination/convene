import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveAdminConfig } from '@/config/admin.config';
import { resolveGeminiConfig } from '@/config/gemini.config';
import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ReportMeetingLifecycleListener } from '@/reports/application/report-meeting-lifecycle.listener';
import { ReportPipelineListener } from '@/reports/application/report-pipeline.listener';
import { SummarizerPort } from '@/reports/domain/ports';
import { GeminiSummarizer } from '@/reports/infrastructure/gemini.summarizer';
import { MongoReportRepository } from '@/reports/infrastructure/mongo-report.repository';
import { NoopNotion } from '@/reports/infrastructure/noop.notion';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';
import { UuidReportIdGenerator } from '@/reports/infrastructure/uuid-report-id.generator';
import { ReportsController } from '@/reports/interface/controllers/reports.controller';
import { ADMIN_API_TOKEN, AdminGuard } from '@/reports/interface/guards/admin.guard';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Reports 기능을 구성하는 NestJS 모듈.
 *
 * - `ReportFinalizationService`는 비-Nest class라 `useFactory`로 묶는다.
 * - `ReportMeetingLifecycleListener`는 Meeting BC의 도메인 이벤트를 구독한다.
 * - 회의록 영속화는 mongoose 기반 `MongoReportRepository`가 책임진다.
 * - SummarizerPort default는 `GeminiSummarizer`. `GEMINI_API_KEY` 미설정 시 `NoopSummarizer`로 fallback.
 * - Notion은 v2 진입 전까지 NoopNotion default.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    MongoReportRepository,
    NoopNotion,
    UuidReportIdGenerator,
    ReportMeetingLifecycleListener,
    ReportPipelineListener,
    AdminGuard,
    {
      provide: ADMIN_API_TOKEN,
      useFactory: (): string | null => resolveAdminConfig()?.token ?? null,
    },
    {
      provide: GeminiSummarizer,
      useFactory: (logger: PinoLogger): SummarizerPort => {
        const config = resolveGeminiConfig();
        if (config === null) {
          logger.warn(
            { context: 'ReportsModule' },
            'GEMINI_API_KEY missing, SummarizerPort falls back to NoopSummarizer',
          );
          return new NoopSummarizer();
        }
        return new GeminiSummarizer(config);
      },
      inject: [PinoLogger],
    },
    {
      provide: ReportFinalizationService,
      useFactory: (
        repository: MongoReportRepository,
        summarizer: GeminiSummarizer,
        notion: NoopNotion,
        idGenerator: UuidReportIdGenerator,
        clock: SystemClock,
        eventPublisher: NestEventBusDomainEventPublisher,
        logger: PinoLogger,
      ) =>
        new ReportFinalizationService({
          repository,
          summarizer,
          notion,
          idGenerator,
          clock,
          eventPublisher,
          logger: new PinoLoggerAdapter(logger, ReportFinalizationService.name),
        }),
      inject: [
        MongoReportRepository,
        GeminiSummarizer,
        NoopNotion,
        UuidReportIdGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
        PinoLogger,
      ],
    },
  ],
})
export class ReportsModule {}
