import { Injectable } from '@nestjs/common';

import { SummarizerInput, SummarizerPort } from '@/reports/domain/ports';
import { ReportSummary } from '@/reports/domain/value-objects';

export interface GeminiSummarizerOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/**
 * Gemini `generateContent` REST API (v1beta) 기반 SummarizerPort 어댑터 — stub.
 *
 * 실제 구현은 green 단계에서 채운다(TDD: spec(red) → impl(green)).
 */
@Injectable()
export class GeminiSummarizer implements SummarizerPort {
  constructor(
    private readonly options: GeminiSummarizerOptions,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async summarize(_input: SummarizerInput): Promise<ReportSummary> {
    void this.options;
    void this.fetchFn;
    throw new Error('not implemented');
  }
}
