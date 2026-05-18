import { Module } from '@nestjs/common';

import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ReportMeetingLifecycleListener } from '@/reports/application/report-meeting-lifecycle.listener';
import { ReportPipelineListener } from '@/reports/application/report-pipeline.listener';
import { InMemoryReportRepository } from '@/reports/infrastructure/in-memory-report.repository';
import { NoopNotion } from '@/reports/infrastructure/noop.notion';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';
import { UuidReportIdGenerator } from '@/reports/infrastructure/uuid-report-id.generator';
import { ReportsController } from '@/reports/interface/controllers/reports.controller';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Reports bounded context 의 NestJS 모듈.
 *
 * - `ReportFinalizationService` 는 비-Nest class 라 `useFactory` 로 묶는다
 *   (Meeting/Mediasoup BC 와 동일 패턴).
 * - `ReportMeetingLifecycleListener` 는 `@OnEvent(meeting.ended)` 데코레이터로
 *   Meeting BC 의 도메인 이벤트를 구독한다.
 * - v1 부트스트랩에서는 in-memory repository + Noop 어댑터를 default provider 로
 *   둔다. MongoDB / Gemini / Notion 실어댑터가 준비되면 provider 토큰만 교체한다.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    InMemoryReportRepository,
    NoopSummarizer,
    NoopNotion,
    UuidReportIdGenerator,
    ReportMeetingLifecycleListener,
    ReportPipelineListener,
    {
      provide: ReportFinalizationService,
      useFactory: (
        repository: InMemoryReportRepository,
        summarizer: NoopSummarizer,
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
        InMemoryReportRepository,
        NoopSummarizer,
        NoopNotion,
        UuidReportIdGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class ReportsModule {}
