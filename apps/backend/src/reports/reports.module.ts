import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveAdminConfig } from '@/config/admin.config';
import { resolveGeminiConfig } from '@/config/gemini.config';
import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ReportLookupService } from '@/reports/application/report-lookup.service';
import { ReportMeetingLifecycleListener } from '@/reports/application/report-meeting-lifecycle.listener';
import { ReportPipelineListener } from '@/reports/application/report-pipeline.listener';
import { REPORT_REPOSITORY } from '@/reports/domain/ports/report.repository';
import { REPORT_ID_GENERATOR } from '@/reports/domain/ports/report-id.generator';
import { SUMMARIZER } from '@/reports/domain/ports/summarizer.port';
import { GeminiSummarizer } from '@/reports/infrastructure/gemini.summarizer';
import { MongoReportRepository } from '@/reports/infrastructure/mongo-report.repository';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';
import { ReportsController } from '@/reports/interface/controllers/reports.controller';
import { ADMIN_API_TOKEN, AdminGuard } from '@/reports/interface/guards/admin.guard';

/**
 * Reports 기능을 구성하는 NestJS 모듈.
 *
 * - `ReportMeetingLifecycleListener`는 Meeting BC의 도메인 이벤트를 구독한다.
 * - 회의록 영속화는 mongoose 기반 `MongoReportRepository`가 책임진다.
 * - SummarizerPort default는 `GeminiSummarizer`. `GEMINI_API_KEY` 미설정 시 `NoopSummarizer`로 fallback.
 * - 회의록의 노션 push는 `notion` BC가 `report.finalized`를 구독해 수행한다(본 모듈 밖).
 *   그 BC가 회의록 본문을 읽도록 `ReportLookupService`를 export한다.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    ReportFinalizationService,
    ReportMeetingLifecycleListener,
    ReportPipelineListener,
    AdminGuard,
    { provide: REPORT_REPOSITORY, useClass: MongoReportRepository },
    ReportLookupService,
    { provide: REPORT_ID_GENERATOR, useValue: { next: () => randomUUID() } },
    { provide: ADMIN_API_TOKEN, useFactory: () => resolveAdminConfig()?.token ?? null },
    {
      provide: SUMMARIZER,
      useFactory: (logger: PinoLogger) => {
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
  ],
  exports: [ReportLookupService],
})
export class ReportsModule {}
