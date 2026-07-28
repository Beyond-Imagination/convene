import { Injectable } from '@nestjs/common';

import { SummarizerInput, SummarizerPort } from '@/reports/domain/ports';
import { ReportSummary, reportSummary } from '@/shared-kernel/domain/value-objects';

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
 * `generationConfig.responseSchema` (OpenAPI-subset — type은 대문자 enum: OBJECT/STRING/ARRAY).
 *
 * 모델단에서 5필드 JSON 구조를 강제해 candidates 텍스트가 항상 계약에 맞는 객체로 오게 한다 →
 * 어댑터의 asString/asStringArray throw 빈도를 낮춘다(요약 실패 감소).
 * `propertyOrdering`은 buildPrompt의 Output format 필드 순서와 동일하게 둬 모델 혼동을 줄인다.
 */
const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    overview: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'STRING' } },
    actionItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          owner: { type: 'STRING' },
          task: { type: 'STRING' },
          due: { type: 'STRING' },
        },
        required: ['task'],
        propertyOrdering: ['owner', 'task', 'due'],
      },
    },
    keyTopics: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          points: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['topic', 'points'],
        propertyOrdering: ['topic', 'points'],
      },
    },
  },
  required: ['title', 'overview', 'decisions', 'actionItems', 'keyTopics'],
  propertyOrdering: ['title', 'overview', 'decisions', 'actionItems', 'keyTopics'],
} as const;

/**
 * Gemini `generateContent` REST API 기반 SummarizerPort 어댑터.
 *
 * POST {baseUrl}/v1beta/models/{model}:generateContent?key={apiKey}
 *   body: {
 *     contents: [{ role: 'user', parts: [{ text: <prompt> }] }],
 *     generationConfig: {
 *       responseMimeType: 'application/json',
 *       temperature: <낮은 값 — 일관성>,
 *       responseSchema: <5필드 구조 강제>
 *     }
 *   }
 *
 * 응답 candidates[0].content.parts[0].text를 JSON.parse → reportSummary VO factory로 정규화한다.
 * JSON 깨짐/필수 필드 누락은 throw 되어 Application Service의 try/catch가 `markSummaryFailed`로 전이한다.
 *
 * 타임아웃은 AbortController로 구현해 fetch 자체에 시간 한계를 둔다.
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

/**
 * 프롬프트는 회의 메타(코드/시각) + transcript 발화별 라인 + chat 라인을 한 묶음으로 모델에 넘긴다.
 *
 * 지시문/스키마는 모두 영어로 작성하지만 (모델이 영어 지시를 더 안정적으로 따르는 경향),
 * **응답 본문(title/overview/decisions/actionItems/keyTopics)은 모두 한국어로 작성**하라고 명시한다.
 * transcript/chat 원본은 한국어 그대로 들어가며 번역하지 않는다.
 *
 * JSON 형식 강제는 `generationConfig.responseMimeType`으로도 한 번 더 보강.
 */
function buildPrompt(input: SummarizerInput): string {
  const { transcript, chat, meta } = input;
  const lines: string[] = [];
  lines.push('You are an assistant that produces structured business-meeting minutes.');
  lines.push('Read the meeting inputs below and write a clean, decision-oriented summary.');
  lines.push(
    'IMPORTANT: Even though these instructions are in English, **all output text (title, overview, decisions, actionItems, keyTopics) MUST be written in Korean (한국어)**. Do not translate the transcript or chat; treat them as source material and quote/paraphrase them in Korean.',
  );
  lines.push('');
  lines.push('## Meeting metadata');
  lines.push(`- meetingId: ${meta.meetingId}`);
  lines.push(`- code: ${meta.code}`);
  lines.push(`- startedAt: ${meta.startedAt.toISOString()}`);
  lines.push(`- endedAt: ${meta.endedAt.toISOString()}`);
  lines.push('');
  lines.push('## Transcript (speaker utterances)');
  if (transcript.length === 0) {
    lines.push('(no utterances)');
  } else {
    for (const seg of transcript) {
      const speaker = seg.speaker ?? 'unknown';
      lines.push(`- [${seg.startMs}ms~${seg.endMs}ms] ${speaker}: ${seg.text}`);
    }
  }
  lines.push('');
  lines.push('## Chat messages');
  if (chat.length === 0) {
    lines.push('(no chat)');
  } else {
    for (const c of chat) {
      lines.push(`- [${c.sentAt.toISOString()}] ${c.nickname}: ${c.text}`);
    }
  }
  lines.push('');
  lines.push('## Output format');
  lines.push(
    'Respond with a single raw JSON object that conforms exactly to the schema below. No code fences, no markdown, no commentary — JSON only. All string values must be written in Korean.',
  );
  lines.push('{');
  lines.push('  "title": string,                       // Korean meeting title (1-200 chars)');
  lines.push('  "overview": string,                    // Korean summary, 1-1000 chars');
  lines.push('  "decisions": string[],                 // Korean decision statements');
  lines.push('  "actionItems": [{ "owner"?: string, "task": string, "due"?: string }],');
  lines.push('  "keyTopics":   [{ "topic": string, "points": string[] }]');
  lines.push('}');
  return lines.join('\n');
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
