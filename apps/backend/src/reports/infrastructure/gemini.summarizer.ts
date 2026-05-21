import { Injectable } from '@nestjs/common';

import { SummarizerInput, SummarizerPort } from '@/reports/domain/ports';
import { ReportSummary, reportSummary } from '@/reports/domain/value-objects';

export interface GeminiSummarizerOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/**
 * Gemini `generateContent` REST API (v1beta) 기반 SummarizerPort 어댑터.
 *
 * POST {baseUrl}/v1beta/models/{model}:generateContent?key={apiKey}
 *   body: {
 *     contents: [{ role: 'user', parts: [{ text: <prompt> }] }],
 *     generationConfig: { responseMimeType: 'application/json' }
 *   }
 *
 * 응답 candidates[0].content.parts[0].text 를 JSON.parse → reportSummary VO
 * factory 로 정규화한다. JSON 깨짐/필수 필드 누락은 throw 되어 Application
 * Service 의 try/catch 가 `markSummaryFailed` 로 전이한다.
 *
 * 타임아웃은 AbortController 로 구현해 fetch 자체에 시간 한계를 둔다.
 *
 * fetch 는 Node 18+ global 을 사용하되 constructor 2번째 인자로 주입 가능해
 * spec 에서 jest.fn() 으로 손쉽게 mock 한다(HttpTranscriber 와 동일 패턴).
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
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `Gemini generateContent 응답이 실패했습니다: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Gemini generateContent 응답에 candidates 텍스트가 없습니다');
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
 * 프롬프트는 회의 메타(코드/시각) + transcript 발화별 라인 + chat 라인을
 * 한 묶음으로 모델에 넘긴다.
 *
 * 지시문/스키마는 모두 영어로 작성하지만 (모델이 영어 지시를 더 안정적으로
 * 따르는 경향), **응답 본문(title/overview/decisions/actionItems/keyTopics)
 * 은 모두 한국어로 작성**하라고 명시한다. transcript/chat 원본은 한국어
 * 그대로 들어가며 번역하지 않는다.
 *
 * JSON 형식 강제는 `generationConfig.responseMimeType` 으로도 한 번 더 보강.
 */
function buildPrompt(input: SummarizerInput): string {
  const { transcript, chat, meta } = input;
  const lines: string[] = [];
  lines.push(
    'You are an assistant that produces structured business-meeting minutes.',
  );
  lines.push(
    'Read the meeting inputs below and write a clean, decision-oriented summary.',
  );
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
  lines.push(
    '  "actionItems": [{ "owner"?: string, "task": string, "due"?: string }],',
  );
  lines.push('  "keyTopics":   [{ "topic": string, "points": string[] }]');
  lines.push('}');
  return lines.join('\n');
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Gemini 응답의 ${field} 가 string 이 아닙니다`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Gemini 응답의 ${field} 가 배열이 아닙니다`);
  }
  return value.map((v, i) => {
    if (typeof v !== 'string') {
      throw new Error(`Gemini 응답의 ${field}[${i}] 가 string 이 아닙니다`);
    }
    return v;
  });
}

function asActionItemArray(
  value: unknown,
): Array<{ owner?: string; task: string; due?: string }> {
  if (!Array.isArray(value)) {
    throw new Error('Gemini 응답의 actionItems 가 배열이 아닙니다');
  }
  return value.map((v, i) => {
    if (typeof v !== 'object' || v === null) {
      throw new Error(`Gemini 응답의 actionItems[${i}] 가 객체가 아닙니다`);
    }
    const item = v as { owner?: unknown; task?: unknown; due?: unknown };
    if (typeof item.task !== 'string') {
      throw new Error(`Gemini 응답의 actionItems[${i}].task 가 string 이 아닙니다`);
    }
    const result: { owner?: string; task: string; due?: string } = { task: item.task };
    if (item.owner !== undefined) {
      if (typeof item.owner !== 'string') {
        throw new Error(`Gemini 응답의 actionItems[${i}].owner 가 string 이 아닙니다`);
      }
      result.owner = item.owner;
    }
    if (item.due !== undefined) {
      if (typeof item.due !== 'string') {
        throw new Error(`Gemini 응답의 actionItems[${i}].due 가 string 이 아닙니다`);
      }
      result.due = item.due;
    }
    return result;
  });
}

function asKeyTopicArray(value: unknown): Array<{ topic: string; points: string[] }> {
  if (!Array.isArray(value)) {
    throw new Error('Gemini 응답의 keyTopics 가 배열이 아닙니다');
  }
  return value.map((v, i) => {
    if (typeof v !== 'object' || v === null) {
      throw new Error(`Gemini 응답의 keyTopics[${i}] 가 객체가 아닙니다`);
    }
    const item = v as { topic?: unknown; points?: unknown };
    if (typeof item.topic !== 'string') {
      throw new Error(`Gemini 응답의 keyTopics[${i}].topic 이 string 이 아닙니다`);
    }
    const points = asStringArray(item.points, `keyTopics[${i}].points`);
    return { topic: item.topic, points };
  });
}
