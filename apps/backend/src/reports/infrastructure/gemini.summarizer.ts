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
 * 한 묶음으로 모델에 넘긴다. 모델은 응답을 ReportSummary 형상의 JSON 으로만
 * 돌려달라고 명시한다. JSON 형식 강제는 `generationConfig.responseMimeType`
 * 으로도 한 번 더 보강된다.
 */
function buildPrompt(input: SummarizerInput): string {
  const { transcript, chat, meta } = input;
  const lines: string[] = [];
  lines.push(
    '당신은 회의 진행을 정리하는 한국어 회의록 작성 비서입니다. 아래 입력을 바탕으로 회사 회의록 형태로 요약을 작성하세요.',
  );
  lines.push('');
  lines.push('## 회의 메타');
  lines.push(`- meetingId: ${meta.meetingId}`);
  lines.push(`- code: ${meta.code}`);
  lines.push(`- startedAt: ${meta.startedAt.toISOString()}`);
  lines.push(`- endedAt: ${meta.endedAt.toISOString()}`);
  lines.push('');
  lines.push('## 발화(transcript)');
  if (transcript.length === 0) {
    lines.push('(발화 없음)');
  } else {
    for (const seg of transcript) {
      const speaker = seg.speaker ?? 'unknown';
      lines.push(`- [${seg.startMs}ms~${seg.endMs}ms] ${speaker}: ${seg.text}`);
    }
  }
  lines.push('');
  lines.push('## 채팅(chat)');
  if (chat.length === 0) {
    lines.push('(채팅 없음)');
  } else {
    for (const c of chat) {
      lines.push(`- [${c.sentAt.toISOString()}] ${c.nickname}: ${c.text}`);
    }
  }
  lines.push('');
  lines.push('## 출력 형식');
  lines.push(
    '아래 JSON 스키마에 정확히 일치하는 JSON 객체만 출력하세요. 코드블록 마크다운 없이 raw JSON 만 출력합니다.',
  );
  lines.push('{');
  lines.push('  "title": string,                       // 회의 제목(1~200자)');
  lines.push('  "overview": string,                    // 한국어 1~1000자 요약');
  lines.push('  "decisions": string[],                 // 결정 사항 항목 배열');
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
