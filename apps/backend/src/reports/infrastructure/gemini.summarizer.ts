import { Injectable } from '@nestjs/common';

import { SummarizerInput, SummarizerPort } from '@/reports/domain/ports/summarizer.port';
import { buildPrompt, SUMMARY_RESPONSE_SCHEMA } from '@/reports/infrastructure/summary-prompt';
import { ReportSummary, reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

export interface GeminiSummarizerOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/**
 * 회의록 요약은 창의적 생성이 아니라 입력 사실의 일관된 정제이므로,
 * Gemini default(1.0)보다 낮은 temperature로 출력 변동을 줄인다.
 */
const SUMMARY_TEMPERATURE = 0.2;

/**
 * Gemini `generateContent` REST API 기반 SummarizerPort 어댑터.
 *
 * JSON 깨짐/필수 필드 누락은 throw 되어 Application Service의 try/catch가 `markSummaryFailed`로 전이한다.
 */
@Injectable()
export class GeminiSummarizer implements SummarizerPort {
  constructor(
    private readonly options: GeminiSummarizerOptions,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async summarize(input: SummarizerInput): Promise<ReportSummary> {
    const url = `${this.options.baseUrl}/v1beta/models/${this.options.model}:generateContent?key=${this.options.apiKey}`;
    const prompt = buildPrompt(input);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: SUMMARY_TEMPERATURE,
            responseSchema: SUMMARY_RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `Gemini generateContent request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Gemini generateContent response has no candidate text');
    }

    const parsed = JSON.parse(text) as {
      title?: unknown;
      overview?: unknown;
      decisions?: unknown;
      actionItems?: unknown;
      keyTopics?: unknown;
    };

    return reportSummary({
      title: asString(parsed.title, 'title'),
      overview: asString(parsed.overview, 'overview'),
      decisions: asStringArray(parsed.decisions, 'decisions'),
      actionItems: asActionItemArray(parsed.actionItems),
      keyTopics: asKeyTopicArray(parsed.keyTopics),
    });
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Gemini response field "${field}" is not a string`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Gemini response field "${field}" is not an array`);
  }
  return value.map((v, i) => {
    if (typeof v !== 'string') {
      throw new Error(`Gemini response field "${field}[${i}]" is not a string`);
    }
    return v;
  });
}

function asActionItemArray(value: unknown): Array<{ owner?: string; task: string; due?: string }> {
  if (!Array.isArray(value)) {
    throw new Error('Gemini response field "actionItems" is not an array');
  }
  return value.map((v, i) => {
    if (typeof v !== 'object' || v === null) {
      throw new Error(`Gemini response field "actionItems[${i}]" is not an object`);
    }
    const item = v as { owner?: unknown; task?: unknown; due?: unknown };
    if (typeof item.task !== 'string') {
      throw new Error(`Gemini response field "actionItems[${i}].task" is not a string`);
    }
    const result: { owner?: string; task: string; due?: string } = { task: item.task };
    if (item.owner !== undefined) {
      if (typeof item.owner !== 'string') {
        throw new Error(`Gemini response field "actionItems[${i}].owner" is not a string`);
      }
      result.owner = item.owner;
    }
    if (item.due !== undefined) {
      if (typeof item.due !== 'string') {
        throw new Error(`Gemini response field "actionItems[${i}].due" is not a string`);
      }
      result.due = item.due;
    }
    return result;
  });
}

function asKeyTopicArray(value: unknown): Array<{ topic: string; points: string[] }> {
  if (!Array.isArray(value)) {
    throw new Error('Gemini response field "keyTopics" is not an array');
  }
  return value.map((v, i) => {
    if (typeof v !== 'object' || v === null) {
      throw new Error(`Gemini response field "keyTopics[${i}]" is not an object`);
    }
    const item = v as { topic?: unknown; points?: unknown };
    if (typeof item.topic !== 'string') {
      throw new Error(`Gemini response field "keyTopics[${i}].topic" is not a string`);
    }
    const points = asStringArray(item.points, `keyTopics[${i}].points`);
    return { topic: item.topic, points };
  });
}
