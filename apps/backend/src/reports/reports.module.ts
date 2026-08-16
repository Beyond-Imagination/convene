import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveAdminConfig } from '@/config/admin.config';
import { resolveGeminiConfig } from '@/config/gemini.config';
import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ReportLookupService } from '@/reports/application/report-lookup.service';
import { ReportMeetingLifecycleListener } from '@/reports/application/report-meeting-lifecycle.listener';
import { ReportPipelineListener } from '@/reports/application/report-pipeline.listener';
import { REPORT_REPOSITORY } from '@/reports/domain/ports/report.repository';
import { SUMMARIZER } from '@/reports/domain/ports/summarizer.port';
import { GeminiSummarizer } from '@/reports/infrastructure/gemini.summarizer';
import { MongoReportRepository } from '@/reports/infrastructure/mongo-report.repository';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';
import { ADMIN_API_TOKEN, AdminGuard } from '@/reports/interface/admin.guard';
import { ReportsController } from '@/reports/interface/reports.controller';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

/**
 * Reports 기능을 구성하는 NestJS 모듈.
 *
 * 회의록의 노션 push는 `notion` BC가 `report.finalized`를 구독해 수행한다(본 모듈 밖).
 * 그 BC가 회의록 본문을 읽도록 `ReportLookupService`를 export한다.
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
        return new GeminiSummarizer(
          config,
          globalThis.fetch,
          new PinoLoggerAdapter(logger, GeminiSummarizer.name),
        );
      },
      inject: [PinoLogger],
    },
  ],
  exports: [ReportLookupService],
})
export class ReportsModule {}
