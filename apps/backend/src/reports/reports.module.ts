import { Module } from '@nestjs/common';

import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ReportMeetingLifecycleListener } from '@/reports/application/report-meeting-lifecycle.listener';
import { ReportPipelineListener } from '@/reports/application/report-pipeline.listener';
import { MongoReportRepository } from '@/reports/infrastructure/mongo-report.repository';
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
 * - 회의록 영속화는 mongoose 기반 `MongoReportRepository` 가 책임진다. mongoose
 *   `Connection` 은 `MongoModule(@Global)` 이 제공한다. transcriber/summarizer/
 *   notion 은 실어댑터가 준비되기 전까지 Noop 가 default provider.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    MongoReportRepository,
    NoopSummarizer,
    NoopNotion,
    UuidReportIdGenerator,
    ReportMeetingLifecycleListener,
    ReportPipelineListener,
    {
      provide: ReportFinalizationService,
      useFactory: (
        repository: MongoReportRepository,
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
        MongoReportRepository,
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
