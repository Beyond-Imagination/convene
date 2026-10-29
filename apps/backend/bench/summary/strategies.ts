import { SummarizerInput } from '@/reports/domain/ports/summarizer.port';
import { buildPrompt, SUMMARY_RESPONSE_SCHEMA } from '@/reports/infrastructure/summary-prompt';

/** 운영 GeminiSummarizer와 같은 값. */
const PROD_TEMPERATURE = 0.2;

const OUTPUT_FORMAT_HEADING = '## Output format';

/** S2 청크 길이. 회의 중 partial STT가 쌓이는 단위가 아니라 요약 입력을 자르는 단위다. */
const CHUNK_MS = 30 * 60_000;
/** S2 청크 요약 동시 호출 수. */
const MAP_CONCURRENCY = 4;

const COVERAGE_RULES = [
  '## Coverage rules',
  '- The meeting may be long and cover several unrelated agendas. Give every part of the meeting, from the first minute to the last, the same attention; the end of the meeting must not crowd out earlier parts.',
  '- keyTopics: list the distinct topics in chronological order, including short ones. When one agenda contains several separate items (e.g. multiple project updates), give each item its own topic. When the same subject comes up at different times, merge all of its mentions into one topic. Use at most 20 keyTopics; if there are more, merge the smallest closely related ones.',
  '- Leave out small talk, breaks, greetings and audio/video checks unless they contain a request or a decision.',
  '- decisions: only what was decided in this meeting. Reviews of earlier decisions, announcements and guidance are not decisions.',
  '- actionItems: collect tasks from the whole meeting, including requests that someone accepted early on.',
  '- The transcript comes from speech recognition: words may be misrecognized, and silent stretches may contain hallucinated or repeated lines. Ignore lines that make no sense in context.',
  '- Speaker labels may be wrong when several people share one microphone. Take an owner from what is said (a name or a self-reference), not from the speaker label alone.',
].join('\n');

const MERGE_RULES = [
  '## Merge rules',
  '- keyTopics: keep every distinct topic from the parts, including short ones, in chronological order. When parts cover the same subject (a topic split by a part boundary, or a subject that comes back later), merge them into one topic and combine their points. Drop only duplicate points. Use at most 20 keyTopics and at most 20 points per topic; if there are more, merge the smallest closely related ones.',
  '- decisions and actionItems: the union of all parts with same-meaning duplicates removed. Keep an owner or due if any part has one. Do not invent new ones.',
  '- title and overview: describe the whole meeting, covering every part evenly.',
  '- Leave owner or due out when unknown; never output an empty string.',
].join('\n');

export interface Usage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface CallResult {
  readonly json: unknown;
  readonly usage: Usage;
}

/** `tag`는 호출 구분자 — 깨진 응답 원문 파일명과 프롬프트 저장에 쓴다. */
export type Generate = (
  tag: string,
  prompt: string,
  schema: object,
  temperature: number,
) => Promise<CallResult>;

export interface StrategyOutput {
  readonly summary: unknown;
  readonly usage: Usage;
  readonly calls: number;
  /** 여러 번 부르는 전략의 중간 산출물(청크별 요약). 디버깅용. */
  readonly parts: ReadonlyArray<unknown>;
}

export interface Strategy {
  readonly id: string;
  readonly describe: string;
  /** null이면 API를 부르지 않고 운영에 저장된 요약을 그대로 채점한다. */
  readonly run: ((input: SummarizerInput, generate: Generate) => Promise<StrategyOutput>) | null;
}

interface Chunk {
  readonly fromMs: number;
  readonly toMs: number;
  readonly input: SummarizerInput;
}

function addUsage(a: Usage, b: Usage): Usage {
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0);
  return {
    promptTokenCount: sum(a.promptTokenCount, b.promptTokenCount),
    candidatesTokenCount: sum(a.candidatesTokenCount, b.candidatesTokenCount),
    thoughtsTokenCount: sum(a.thoughtsTokenCount, b.thoughtsTokenCount),
    totalTokenCount: sum(a.totalTokenCount, b.totalTokenCount),
  };
}

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 지시 블록만 끼운다 — transcript 표현이 S0와 같아야 지시문 효과만 비교된다. */
function withCoverageRules(prompt: string): string {
  const at = prompt.lastIndexOf(OUTPUT_FORMAT_HEADING);
  if (at < 0) throw new Error('buildPrompt output has no Output format section');
  return `${prompt.slice(0, at)}${COVERAGE_RULES}\n\n${prompt.slice(at)}`;
}

function single(prompt: (input: SummarizerInput) => string): Strategy['run'] {
  return async (input, generate) => {
    const out = await generate('single', prompt(input), SUMMARY_RESPONSE_SCHEMA, PROD_TEMPERATURE);
    return { summary: out.json, usage: out.usage, calls: 1, parts: [] };
  };
}

/** 발화가 없는 구간은 건너뛴다. 오프셋은 회의 시작 기준 그대로 둬 프롬프트의 mm:ss가 전체 회의 시각을 가리키게 한다. */
function toChunks(input: SummarizerInput): Chunk[] {
  const startedAt = input.meta.startedAt.getTime();
  const lastMs = Math.max(0, ...input.transcript.map((s) => s.startMs));
  const chunks: Chunk[] = [];
  for (let fromMs = 0; fromMs <= lastMs; fromMs += CHUNK_MS) {
    const toMs = fromMs + CHUNK_MS;
    const inWindow = (ms: number) => ms >= fromMs && ms < toMs;
    const transcript = input.transcript.filter((s) => inWindow(s.startMs));
    if (transcript.length === 0) continue;
    chunks.push({
      fromMs,
      toMs,
      input: {
        transcript,
        chat: input.chat.filter((c) => inWindow(c.sentAt.getTime() - startedAt)),
        meta: input.meta,
      },
    });
  }
  return chunks;
}

function chunkPrompt(chunk: Chunk, index: number, total: number): string {
  const preface = [
    `This input is part ${index + 1} of ${total} of a longer meeting, covering ${mmss(chunk.fromMs)}-${mmss(chunk.toMs)} from the start.`,
    'Summarize only this part: the overview describes only this part, and keyTopics, decisions and actionItems come only from this part.',
    '',
  ].join('\n');
  return preface + withCoverageRules(buildPrompt(chunk.input));
}

function mergePrompt(
  input: SummarizerInput,
  parts: ReadonlyArray<{ chunk: Chunk; summary: unknown }>,
): string {
  const full = buildPrompt({ ...input, transcript: [], chat: [] });
  const outputFormat = full.slice(full.lastIndexOf(OUTPUT_FORMAT_HEADING));
  const lines: string[] = [];
  lines.push(
    'You merge partial minutes of one long business meeting into a single set of minutes for the whole meeting.',
  );
  lines.push(
    'IMPORTANT: **all output text (title, overview, decisions, actionItems, keyTopics) MUST be written in Korean (한국어)**.',
  );
  lines.push('');
  lines.push('## Partial minutes (chronological, times from meeting start)');
  parts.forEach(({ chunk, summary }, i) => {
    lines.push(`### Part ${i + 1} (${mmss(chunk.fromMs)}-${mmss(chunk.toMs)})`);
    lines.push(JSON.stringify(summary));
  });
  lines.push('');
  lines.push(MERGE_RULES);
  lines.push('');
  lines.push(outputFormat);
  return lines.join('\n');
}

async function mapLimited<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** S2: 30분 청크마다 S0′로 요약(map)한 뒤, 청크 요약만 모아 한 번 더 병합(reduce)한다. */
async function chunked(input: SummarizerInput, generate: Generate): Promise<StrategyOutput> {
  const chunks = toChunks(input);
  const mapped = await mapLimited(chunks, MAP_CONCURRENCY, (chunk, i) =>
    generate(
      `chunk${i + 1}`,
      chunkPrompt(chunk, i, chunks.length),
      SUMMARY_RESPONSE_SCHEMA,
      PROD_TEMPERATURE,
    ),
  );
  const parts = chunks.map((chunk, i) => ({ chunk, summary: mapped[i].json }));
  const merged = await generate(
    'merge',
    mergePrompt(input, parts),
    SUMMARY_RESPONSE_SCHEMA,
    PROD_TEMPERATURE,
  );
  return {
    summary: merged.json,
    usage: [...mapped, merged].reduce<Usage>((acc, r) => addUsage(acc, r.usage), {}),
    calls: chunks.length + 1,
    parts: parts.map(({ chunk, summary }) => ({ fromMs: chunk.fromMs, toMs: chunk.toMs, summary })),
  };
}

export const STRATEGIES: Readonly<Record<string, Strategy>> = {
  prod: { id: 'prod', describe: '운영 DB에 저장된 요약(단일 회의만)', run: null },
  s0: {
    id: 's0',
    describe: '현재 운영 프롬프트 그대로, 종료 후 1회 요약',
    run: single(buildPrompt),
  },
  s0p: {
    id: 's0p',
    describe: 'S0 + 커버리지 지시문(프롬프트만 수정)',
    run: single((input) => withCoverageRules(buildPrompt(input))),
  },
  s2: {
    id: 's2',
    describe: '30분 청크별 S0′ 요약 → 청크 요약 병합',
    run: chunked,
  },
};
