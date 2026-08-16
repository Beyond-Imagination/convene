import { TranscriptSegment } from '@/reports/domain/entries/transcript-segment';
import { SummarizerInput } from '@/reports/domain/ports/summarizer.port';

/**
 * `generationConfig.responseSchema` (OpenAPI-subset — type은 대문자 enum: OBJECT/STRING/ARRAY).
 *
 * 모델단에서 5필드 JSON 구조를 강제해 candidates 텍스트가 항상 계약에 맞는 객체로 오게 한다 →
 * 어댑터의 asString/asStringArray throw 빈도를 낮춘다(요약 실패 감소).
 * `propertyOrdering`은 아래 buildPrompt의 Output format 필드 순서와 동일하게 둬 모델 혼동을 줄인다.
 * 그래서 이 둘은 항상 같이 고쳐야 하며 같은 파일에 둔다.
 */
export const SUMMARY_RESPONSE_SCHEMA = {
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

interface Utterance {
  startMs: number;
  speaker: string;
  text: string;
}

/** 회의 시작 기준 경과 시각. 한 시간이 넘으면 분이 그대로 누적된다(`75:05`). */
function formatOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * STT가 5~8초 단위로 끊어 놓은 조각을 화자별로 다시 잇는다.
 * 줄마다 반복되던 화자명이 사라지고, 잘린 문장이 온전해져 모델이 읽기도 낫다.
 */
function mergeConsecutive(transcript: ReadonlyArray<TranscriptSegment>): Utterance[] {
  const merged: Utterance[] = [];
  for (const seg of transcript) {
    const speaker = seg.speaker ?? 'unknown';
    const last = merged[merged.length - 1];
    if (last !== undefined && last.speaker === speaker) {
      last.text += ` ${seg.text}`;
      continue;
    }
    merged.push({ startMs: seg.startMs, speaker, text: seg.text });
  }
  return merged;
}

/**
 * 프롬프트는 회의 메타(코드/시각) + transcript 발화별 라인 + chat 라인을 한 묶음으로 모델에 넘긴다.
 *
 * 지시문/스키마는 모두 영어로 작성하지만 (모델이 영어 지시를 더 안정적으로 따르는 경향),
 * **응답 본문(title/overview/decisions/actionItems/keyTopics)은 모두 한국어로 작성**하라고 명시한다.
 * transcript/chat 원본은 한국어 그대로 들어가며 번역하지 않는다.
 *
 * JSON 형식 강제는 `generationConfig.responseMimeType`으로도 한 번 더 보강.
 *
 * 발화·채팅 줄에는 회의 시작 기준 mm:ss만 남긴다 — 요약에 필요한 건 순서와 대략의 시점이고,
 * ms 단위 구간은 줄마다 본문만 한 분량을 차지한다.
 */
export function buildPrompt(input: SummarizerInput): string {
  const { transcript, chat, meta } = input;
  const meetingStartMs = meta.startedAt.getTime();
  const lines: string[] = [];
  lines.push('You are an assistant that produces structured business-meeting minutes.');
  lines.push('Read the meeting inputs below and write a clean, decision-oriented summary.');
  lines.push(
    'IMPORTANT: Even though these instructions are in English, **all output text (title, overview, decisions, actionItems, keyTopics) MUST be written in Korean (한국어)**. Do not translate the transcript or chat; treat them as source material and quote/paraphrase them in Korean.',
  );
  lines.push('');
  lines.push('## Meeting metadata');
  lines.push(`- code: ${meta.code}`);
  lines.push(`- startedAt: ${meta.startedAt.toISOString()}`);
  lines.push(`- endedAt: ${meta.endedAt.toISOString()}`);
  lines.push('');
  lines.push('## Transcript [mm:ss from start]');
  if (transcript.length === 0) {
    lines.push('(no utterances)');
  } else {
    for (const utterance of mergeConsecutive(transcript)) {
      lines.push(`- [${formatOffset(utterance.startMs)}] ${utterance.speaker}: ${utterance.text}`);
    }
  }
  lines.push('');
  lines.push('## Chat');
  if (chat.length === 0) {
    lines.push('(no chat)');
  } else {
    for (const c of chat) {
      lines.push(
        `- [${formatOffset(c.sentAt.getTime() - meetingStartMs)}] ${c.nickname}: ${c.text}`,
      );
    }
  }
  lines.push('');
  lines.push('## Output format');
  lines.push(
    'Respond with a single raw JSON object that conforms exactly to the schema below. No code fences, no markdown, no commentary — JSON only.',
  );
  lines.push('{');
  lines.push('  "title": string, // ≤200 chars');
  lines.push('  "overview": string, // ≤1000 chars');
  lines.push('  "decisions": string[],');
  lines.push('  "actionItems": [{ "owner"?: string, "task": string, "due"?: string }],');
  lines.push('  "keyTopics": [{ "topic": string, "points": string[] }]');
  lines.push('}');
  return lines.join('\n');
}
