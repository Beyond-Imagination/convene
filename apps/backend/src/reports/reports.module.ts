import { Logger, Module } from '@nestjs/common';

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
import { ADMIN_API_TOKEN,AdminGuard } from '@/reports/interface/guards/admin.guard';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Reports 기능을 구성하는 NestJS 모듈.
 *
 * - `ReportFinalizationService` 는 비-Nest class 라 `useFactory` 로 묶는다.
 * - `ReportMeetingLifecycleListener` 는 `@OnEvent(meeting.ended)` 데코레이터로
 *   Meeting BC 의 도메인 이벤트를 구독한다.
 * - 회의록 영속화는 mongoose 기반 `MongoReportRepository` 가 책임진다. mongoose
 *   `Connection` 은 `MongoModule(@Global)` 이 제공한다.
 * - SummarizerPort default 는 `GeminiSummarizer`. `GEMINI_API_KEY` 미설정 시
 *   `NoopSummarizer` 로 fallback(부트스트랩만 통과시키고 로그 경고). e2e/유닛
 *   테스트는 `overrideProvider(GeminiSummarizer).useValue(NoopSummarizer)` 로
 *   외부 호출을 차단한다(reports.e2e-spec / meeting.e2e-spec).
 * - Notion 은 v2 진입 전까지 NoopNotion default.
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
      // 관리자 재요약 엔드포인트 보호. ADMIN_API_TOKEN 미설정 시 token=null →
      // AdminGuard 가 엔드포인트를 비활성(403)으로 막는다.
      provide: ADMIN_API_TOKEN,
      useFactory: (): string | null => resolveAdminConfig()?.token ?? null,
    },
    {
      provide: GeminiSummarizer,
      useFactory: (): SummarizerPort => {
        const config = resolveGeminiConfig();
        if (config === null) {
          new Logger('ReportsModule').warn(
            'GEMINI_API_KEY 미설정 — SummarizerPort 는 NoopSummarizer 로 fallback 됩니다(요약 미적용).',
          );
          return new NoopSummarizer();
        }
        return new GeminiSummarizer(config);
      },
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
      ) =>
        new ReportFinalizationService({
          repository,
          summarizer,
          notion,
          idGenerator,
          clock,
          eventPublisher,
        }),
      inject: [
        MongoReportRepository,
        GeminiSummarizer,
        NoopNotion,
        UuidReportIdGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class ReportsModule {}
