import { Injectable, Logger } from '@nestjs/common';

import { SummarizerInput, SummarizerPort } from '@/reports/domain/ports';
import { ReportSummary, reportSummary } from '@/shared-kernel/domain/value-objects';

/**
 * SummarizerPort의 부트스트랩 fallback 구현체.
 *
 * Gemini 같은 실제 LLM 어댑터가 환경마다 준비돼 있지 않을 수 있어, 어댑터 미설정 상태에서도 회의록 파이프라인이
 * finalize까지 진행되도록 placeholder `ReportSummary`를 돌려준다.
 */
@Injectable()
export class NoopSummarizer implements SummarizerPort {
  private readonly logger = new Logger(NoopSummarizer.name);

  async summarize(_input: SummarizerInput): Promise<ReportSummary> {
    this.logger.warn(
      'NoopSummarizer가 호출되었습니다. 실제 LLM 어댑터(SummarizerPort)로 교체하세요.',
    );
    return reportSummary({
      title: '(요약 미적용)',
      overview: 'Summarizer 어댑터가 설정되지 않아 자동 요약을 건너뛰었습니다.',
      decisions: [],
      actionItems: [],
      keyTopics: [],
    });
  }
}
