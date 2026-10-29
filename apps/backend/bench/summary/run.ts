/**
 * 요약 전략 벤치. 실제 회의 데이터·정답·결과는 커밋하지 않는 data/, results/에만 둔다.
 *
 *   npx ts-node -r tsconfig-paths/register bench/summary/run.ts export --codes 9midnhyd,joxo3yyp --env-file .env
 *   npx ts-node -r tsconfig-paths/register bench/summary/run.ts run --inputs 9midnhyd,solo,head,middle,tail --strategies prod,s0,s0p,s2 --reps 3 [--model gemini-2.5-pro] --env-file .env
 *   npx ts-node -r tsconfig-paths/register bench/summary/run.ts judge|report --run <results 하위 폴더명>
 *
 * --model은 요약 모델만 바꾼다. 채점 모델은 BENCH_JUDGE_MODEL(없으면 GEMINI_MODEL)로 고정해 run끼리 비교되게 한다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GeminiSummarizer } from '@/reports/infrastructure/gemini.summarizer';
import { isRetryableHttpStatus, withRetry } from '@/shared-kernel/infrastructure/retry';

import { exportMeetings, loadBenchInput, loadVariantConfig } from './data';
import { buildJudgePrompt, computeMetrics, JUDGE_SCHEMA, JudgeResult, Metrics } from './judge';
import { CallResult, GenerateOptions, STRATEGIES, Usage } from './strategies';

const BENCH_DIR = __dirname;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
/** 4시간 회의 한 번에 운영 기본값(30초)을 넘길 수 있다. */
const DEFAULT_TIMEOUT_MS = 300_000;
/** 0이면 Gemini가 정수 배열 같은 데서 반복 루프에 빠지기 쉽다. */
const JUDGE_TEMPERATURE = 0.2;

interface SummaryRecord {
  inputId: string;
  strategy: string;
  rep: number;
  model: string | null;
  /** 여러 번 부르는 전략은 합산. */
  usage: Usage | null;
  /** 동시 호출을 포함한 전체 소요 시간. */
  latencyMs: number | null;
  calls?: number;
  parts?: ReadonlyArray<unknown>;
  /** 운영 ReportSummary VO 검증 결과. 실패해도 원문은 채점한다(운영이면 요약 실패로 끝났을 출력). */
  prodValid: boolean;
  prodError: string | null;
  summary: unknown;
}

/** 지표는 저장하지 않고 report 때마다 다시 계산한다 — 지표 코드를 고쳐도 재채점이 필요 없다. */
interface JudgeRecord {
  judgeModel: string;
  usage: Usage;
  result: JudgeResult;
}

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const [command = '', ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const next = rest[i + 1];
    flags.set(rest[i].slice(2), next && !next.startsWith('--') ? next : 'true');
  }
  return { command, flags };
}

function list(flags: Map<string, string>, key: string, fallback: string): string[] {
  return (flags.get(key) ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}가 필요합니다 (--env-file로 지정 가능)`);
  return value;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function runId(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

/** 응답이 JSON으로 깨지는 건(반복 루프·토큰 한도 절단) 다시 부르면 대개 풀린다. 마지막 원문은 dumpPath에 남긴다. */
async function generateJson(
  model: string,
  prompt: string,
  schema: object,
  temperature: number,
  dumpPath: string,
  options: GenerateOptions = {},
): Promise<CallResult> {
  const baseUrl = process.env.GEMINI_BASE_URL ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${requireEnv('GEMINI_API_KEY')}`;
  const timeoutMs = Number(process.env.BENCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
      responseSchema: schema,
      ...(options.thinkingBudget === undefined
        ? {}
        : { thinkingConfig: { thinkingBudget: options.thinkingBudget } }),
    },
  });

  return withRetry(
    {
      maxAttempts: 4,
      baseDelayMs: 2_000,
      isRetryable: (e) => !(e instanceof GeminiHttpError) || isRetryableHttpStatus(e.status),
      onRetry: (attempt, delayMs, e) =>
        console.warn(`  retry ${attempt} in ${delayMs}ms: ${String(e).slice(0, 200)}`),
    },
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let payload: {
        candidates?: Array<{
          finishReason?: string;
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: Usage;
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (!res.ok) throw new GeminiHttpError(res.status, `${res.status} ${await res.text()}`);
        payload = (await res.json()) as typeof payload;
      } finally {
        clearTimeout(timer);
      }
      const candidate = payload.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text ?? '';
      try {
        return {
          json: JSON.parse(text),
          usage: payload.usageMetadata ?? {},
        };
      } catch (e) {
        writeFileSync(dumpPath, text);
        throw new Error(
          `JSON parse failed (finishReason=${candidate?.finishReason}, ${text.length} chars, raw → ${dumpPath}): ${e}`,
        );
      }
    },
  );
}

/** 운영 GeminiSummarizer의 응답 해석·VO 검증을 그대로 태운다 — 응답 JSON을 돌려주는 가짜 fetch를 꽂는다. */
async function validateForProd(summary: unknown): Promise<string | null> {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(summary) }] } }] }),
      { status: 200 },
    )) as typeof fetch;
  const adapter = new GeminiSummarizer(
    {
      apiKey: '-',
      model: '-',
      baseUrl: '-',
      timeoutMs: 1_000,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
    },
    fakeFetch,
  );
  const now = new Date();
  try {
    await adapter.summarize({
      transcript: [],
      chat: [],
      meta: { meetingId: '-', code: '-', startedAt: now, endedAt: now },
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function summarize(
  dataDir: string,
  runDir: string,
  inputId: string,
  strategyId: string,
  reps: number,
  model: string,
): Promise<void> {
  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw new Error(`unknown strategy: ${strategyId}`);
  const bench = loadBenchInput(dataDir, inputId);
  const dir = join(runDir, inputId);
  mkdirSync(dir, { recursive: true });

  if (strategy.run === null) {
    if (bench.stitched || bench.prodSummary === null) {
      console.log(`skip ${inputId}/${strategyId}: 운영 요약 없음`);
      return;
    }
    const error = await validateForProd(bench.prodSummary);
    const record: SummaryRecord = {
      inputId,
      strategy: strategyId,
      rep: 1,
      model: null,
      usage: null,
      latencyMs: null,
      prodValid: error === null,
      prodError: error,
      summary: bench.prodSummary,
    };
    writeJson(join(dir, `${strategyId}-1.summary.json`), record);
    return;
  }

  for (let rep = 1; rep <= reps; rep++) {
    // 중간에 끊긴 run을 같은 --name으로 다시 돌리면 끝난 회차는 건너뛴다.
    if (existsSync(join(dir, `${strategyId}-${rep}.summary.json`))) continue;
    console.log(`summarize ${inputId}/${strategyId} #${rep}`);
    const startedAt = Date.now();
    const out = await strategy.run(bench.input, (tag, prompt, schema, temperature, options) => {
      if (rep === 1) writeFileSync(join(dir, `${strategyId}.${tag}.prompt.txt`), prompt);
      return generateJson(
        model,
        prompt,
        schema,
        temperature,
        join(dir, `${strategyId}-${rep}.${tag}.raw.txt`),
        options,
      );
    });
    const error = await validateForProd(out.summary);
    const record: SummaryRecord = {
      inputId,
      strategy: strategyId,
      rep,
      model,
      usage: out.usage,
      latencyMs: Date.now() - startedAt,
      calls: out.calls,
      parts: out.parts,
      prodValid: error === null,
      prodError: error,
      summary: out.summary,
    };
    writeJson(join(dir, `${strategyId}-${rep}.summary.json`), record);
  }
}

function summaryFiles(runDir: string): Array<{ inputId: string; path: string }> {
  return readdirSync(runDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(runDir, d.name))
        .filter((f) => f.endsWith('.summary.json'))
        .map((f) => ({ inputId: d.name, path: join(runDir, d.name, f) })),
    );
}

async function judgeRun(dataDir: string, runDir: string, force: boolean): Promise<void> {
  const scoring = loadVariantConfig(dataDir).scoring;
  const model = process.env.BENCH_JUDGE_MODEL ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  // 채점 출력 토큰의 대부분이 사고 토큰이다. 비용을 줄일 때만 지정한다(0이면 끔).
  const thinking = process.env.BENCH_JUDGE_THINKING;
  const judgeOptions: GenerateOptions =
    thinking === undefined ? {} : { thinkingBudget: Number(thinking) };
  for (const { inputId, path } of summaryFiles(runDir)) {
    const judgePath = path.replace('.summary.json', '.judge.json');
    if (!force && existsSync(judgePath)) continue;
    const bench = loadBenchInput(dataDir, inputId);
    const record = readJson<SummaryRecord>(path);
    console.log(`judge ${inputId}/${record.strategy} #${record.rep}`);
    const out = await generateJson(
      model,
      buildJudgePrompt(bench.gold, record.summary, scoring),
      JUDGE_SCHEMA,
      JUDGE_TEMPERATURE,
      path.replace('.summary.json', '.judge.raw.txt'),
      judgeOptions,
    );
    const judged: JudgeRecord = {
      judgeModel: model,
      usage: out.usage,
      result: out.json as JudgeResult,
    };
    writeJson(judgePath, judged);
  }
}

function fmt(values: Array<number | null>, percent: boolean): string {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return '-';
  const show = (v: number) => (percent ? `${Math.round(v * 100)}` : `${Math.round(v * 10) / 10}`);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? show(mean) : `${show(mean)} (${show(min)}–${show(max)})`;
}

const REPORT_COLUMNS: Array<[keyof Metrics, string, boolean]> = [
  ['topicsMajor', '주제(중요)%', true],
  ['topicsMinor', '주제(부수)%', true],
  ['facts', '사실%', true],
  ['decisions', '결정%', true],
  ['actions', '액션%', true],
  ['crossCuttingGathered', '흩어진주제 모음%', true],
  ['crossCuttingOccurrences', '흩어진주제 언급%', true],
  ['early', '앞1/3%', true],
  ['middle', '중1/3%', true],
  ['late', '뒤1/3%', true],
  ['insertTopics', '삽입 주제%', true],
  ['insertDecisions', '삽입 결정%', true],
  ['insertActions', '삽입 액션%', true],
  ['notDecisionsAsDecision', '비결정→결정', false],
  ['unsupportedDecisions', '근거없는 결정', false],
  ['noiseLeaks', '잡음 유출', false],
  ['factErrors', '의미 오류', false],
  ['unverified', '근거 불일치', false],
];

/** 운영 검증과 지표는 저장값이 아니라 지금 코드로 다시 계산한다 — 어댑터·지표를 고친 뒤 옛 run에도 반영된다. */
async function writeReport(dataDir: string, runDir: string): Promise<void> {
  const groups = new Map<string, Array<{ summary: SummaryRecord; metrics: Metrics | null }>>();
  for (const { inputId, path } of summaryFiles(runDir)) {
    const stored = readJson<SummaryRecord>(path);
    const summary = { ...stored, prodValid: (await validateForProd(stored.summary)) === null };
    const judgePath = path.replace('.summary.json', '.judge.json');
    let metrics: Metrics | null = null;
    if (existsSync(judgePath)) {
      const bench = loadBenchInput(dataDir, inputId);
      const judge = readJson<JudgeRecord>(judgePath);
      metrics = computeMetrics(bench.gold, judge.result, summary.summary, bench.totalMs);
    }
    const key = `${inputId} | ${summary.strategy} | ${summary.model ?? '-'}`;
    groups.set(key, [...(groups.get(key) ?? []), { summary, metrics }]);
  }

  const header = [
    '입력 | 전략 | 모델',
    'n',
    '호출',
    '운영검증통과',
    ...REPORT_COLUMNS.map(([, label]) => label),
    '입력토큰',
    '출력토큰',
    '지연s',
  ];
  const rows = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, runs]) => {
      const judged = runs.flatMap((r) => (r.metrics ? [r.metrics] : []));
      const usage = runs.map((r) => r.summary.usage);
      return [
        key,
        String(runs.length),
        fmt(
          runs.map((r) => r.summary.calls ?? null),
          false,
        ),
        `${runs.filter((r) => r.summary.prodValid).length}/${runs.length}`,
        ...REPORT_COLUMNS.map(([field, , percent]) =>
          fmt(
            judged.map((m) => m[field]),
            percent,
          ),
        ),
        fmt(
          usage.map((u) => u?.promptTokenCount ?? null),
          false,
        ),
        fmt(
          usage.map((u) =>
            u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null,
          ),
          false,
        ),
        fmt(
          runs.map((r) => (r.summary.latencyMs === null ? null : r.summary.latencyMs / 1000)),
          false,
        ),
      ];
    });

  const table = [header, header.map(() => '---'), ...rows].map((r) => `| ${r.join(' | ')} |`);
  const report = [
    `# 요약 벤치 ${runDir.split(/[\\/]/).pop()}`,
    '',
    '값은 반복 평균, 괄호는 최소–최대. 주제 점수는 커버된 사실 비율(이름만 언급되면 0.25). 근거가 요약 원문에 없는 판정은 미커버로 내렸다(근거 불일치). 채점은 LLM 판정이라 사람 검수 전 수치다.',
    '',
    ...table,
    '',
  ].join('\n');
  writeFileSync(join(runDir, 'report.md'), report);
  console.log(report);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const envFile = flags.get('env-file');
  if (envFile) process.loadEnvFile(envFile);
  const dataDir = flags.get('data') ?? join(BENCH_DIR, 'data');
  const resultsDir = flags.get('results') ?? join(BENCH_DIR, 'results');

  switch (command) {
    case 'export':
      await exportMeetings(
        dataDir,
        list(flags, 'codes', ''),
        requireEnv('MONGO_URI'),
        requireEnv('MONGO_DB_NAME'),
      );
      return;
    case 'run': {
      const runDir = join(resultsDir, flags.get('name') ?? runId());
      mkdirSync(runDir, { recursive: true });
      const reps = Number(flags.get('reps') ?? 3);
      const model = flags.get('model') ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
      for (const inputId of list(flags, 'inputs', '9midnhyd,solo,head,middle,tail')) {
        for (const strategyId of list(flags, 'strategies', 'prod,s0,s0p,s2')) {
          await summarize(dataDir, runDir, inputId, strategyId, reps, model);
        }
      }
      if (flags.get('skip-judge') !== 'true') await judgeRun(dataDir, runDir, false);
      await writeReport(dataDir, runDir);
      return;
    }
    case 'judge':
    case 'report': {
      const name = flags.get('run');
      if (!name) throw new Error('--run <results 하위 폴더명>이 필요합니다');
      const runDir = join(resultsDir, name);
      if (command === 'judge') await judgeRun(dataDir, runDir, flags.get('force') === 'true');
      await writeReport(dataDir, runDir);
      return;
    }
    default:
      throw new Error(`unknown command: ${command || '(없음)'} — export | run | judge | report`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
