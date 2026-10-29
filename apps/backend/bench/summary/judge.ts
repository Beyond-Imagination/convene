import { Gold, GoldPoint, GoldTopic } from './data';

/**
 * 주제 점수는 판정 라벨(full/partial)이 아니라 커버된 사실 비율로 낸다 — 라벨은 같은 내용에도 판정마다 흔들린다.
 * 사실은 하나도 없이 주제 이름만 언급되면 이 값을 준다.
 */
const MENTION_ONLY_SCORE = 0.25;

/** 근거가 요약 원문에 있는지 볼 때 쓰는 조각 길이(정규화 후 글자 수). */
const EVIDENCE_WINDOW = 10;
/** 의역된 근거를 인정하는 단어 겹침 비율. */
const WORD_OVERLAP = 0.7;
/** '기능'·'요청' 같은 두 글자 단어는 어느 요약에나 있어 정답 키를 베낀 근거도 통과시킨다. */
const MIN_WORD_LENGTH = 3;

const STRING = { type: 'STRING' } as const;
const BOOLEAN = { type: 'BOOLEAN' } as const;
const INTEGERS = { type: 'ARRAY', items: { type: 'INTEGER' } } as const;

function objectArray(properties: Record<string, object>, required: string[]) {
  return {
    type: 'ARRAY',
    items: { type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties) },
  };
}

export const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topics: objectArray(
      {
        id: STRING,
        coverage: { type: 'STRING', enum: ['full', 'partial', 'none'] },
        coveredFacts: INTEGERS,
        evidence: STRING,
      },
      ['id', 'coverage', 'coveredFacts', 'evidence'],
    ),
    crossCutting: objectArray(
      { id: STRING, gathered: BOOLEAN, coveredOccurrences: INTEGERS, evidence: STRING },
      ['id', 'gathered', 'coveredOccurrences', 'evidence'],
    ),
    decisions: objectArray({ id: STRING, covered: BOOLEAN, evidence: STRING }, [
      'id',
      'covered',
      'evidence',
    ]),
    actionItems: objectArray({ id: STRING, covered: BOOLEAN, ownerOk: BOOLEAN, evidence: STRING }, [
      'id',
      'covered',
      'ownerOk',
      'evidence',
    ]),
    extraDecisions: objectArray(
      { text: STRING, kind: { type: 'STRING', enum: ['notDecision', 'unsupported', 'unlisted'] } },
      ['text', 'kind'],
    ),
    extraActionItems: objectArray(
      { text: STRING, kind: { type: 'STRING', enum: ['unsupported', 'unlisted'] } },
      ['text', 'kind'],
    ),
    noiseLeaks: { type: 'ARRAY', items: STRING },
    factErrors: objectArray({ field: STRING, text: STRING, reason: STRING }, [
      'field',
      'text',
      'reason',
    ]),
  },
  required: [
    'topics',
    'crossCutting',
    'decisions',
    'actionItems',
    'extraDecisions',
    'extraActionItems',
    'noiseLeaks',
    'factErrors',
  ],
} as const;

export interface JudgeResult {
  topics: Array<{
    id: string;
    coverage: 'full' | 'partial' | 'none';
    coveredFacts: number[];
    evidence: string;
  }>;
  crossCutting: Array<{
    id: string;
    gathered: boolean;
    coveredOccurrences: number[];
    /** 근거 필드를 넣기 전 채점 결과에는 없다 — 없으면 검증 실패로 본다. */
    evidence?: string;
  }>;
  decisions: Array<{ id: string; covered: boolean; evidence: string }>;
  actionItems: Array<{ id: string; covered: boolean; ownerOk: boolean; evidence: string }>;
  extraDecisions: Array<{ text: string; kind: 'notDecision' | 'unsupported' | 'unlisted' }>;
  extraActionItems: Array<{ text: string; kind: 'unsupported' | 'unlisted' }>;
  noiseLeaks: string[];
  factErrors: Array<{ field: string; text: string; reason: string }>;
}

type Recall = number | null;

export interface Metrics {
  topicsMajor: Recall;
  topicsMinor: Recall;
  facts: Recall;
  decisions: Recall;
  actions: Recall;
  actionOwners: Recall;
  crossCuttingGathered: Recall;
  crossCuttingOccurrences: Recall;
  /** 회의 길이를 삼등분해, 각 구간에서 시작한 주제·결정·액션의 재현율. */
  early: Recall;
  middle: Recall;
  late: Recall;
  /** 이어 붙인 입력에서 insert(`I:`) 쪽만의 재현율. */
  insertTopics: Recall;
  insertDecisions: Recall;
  insertActions: Recall;
  notDecisionsAsDecision: number;
  unsupportedDecisions: number;
  unsupportedActions: number;
  noiseLeaks: number;
  factErrors: number;
  /** 근거가 요약 원문에서 확인되지 않아 '커버 안 됨'으로 내린 판정 수. */
  unverified: number;
}

function ratio(hits: number, total: number): Recall {
  return total === 0 ? null : hits / total;
}

function topicScore(topic: GoldTopic, verdict: JudgeResult['topics'][number] | undefined): number {
  if (!verdict || verdict.coverage === 'none') return 0;
  const covered = new Set(verdict.coveredFacts.filter((i) => i >= 0 && i < topic.facts.length));
  if (covered.size === 0) return MENTION_ONLY_SCORE;
  return covered.size / topic.facts.length;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * 판정 근거가 요약 원문에 실제로 있는지. 정답 키 문장을 근거로 베껴 와 '커버됨'이라 하는 오판을 거른다.
 * 그대로 인용한 근거는 조각 일치로, 요약을 의역한 근거는 단어 겹침으로 통과시킨다.
 */
function quotedFrom(evidence: string | undefined, summaryText: string): boolean {
  const e = normalize(evidence ?? '');
  if (e.length === 0) return false;
  if (summaryText.includes(e)) return true;
  if (e.length >= EVIDENCE_WINDOW) {
    let hits = 0;
    let total = 0;
    for (let i = 0; i + EVIDENCE_WINDOW <= e.length; i += EVIDENCE_WINDOW / 2) {
      total += 1;
      if (summaryText.includes(e.slice(i, i + EVIDENCE_WINDOW))) hits += 1;
    }
    if (hits * 2 >= total) return true;
  }
  const words = (evidence ?? '')
    .split(/\s+/)
    .map(normalize)
    .filter((w) => w.length >= MIN_WORD_LENGTH);
  if (words.length === 0) return false;
  return words.filter((w) => summaryText.includes(w)).length >= words.length * WORD_OVERLAP;
}

/** 근거가 확인되지 않는 '커버됨'은 내리고, 정답에 owner가 없는 액션은 owner 판정을 통과시킨다. */
function verify(
  gold: Gold,
  judge: JudgeResult,
  summary: unknown,
): { judge: JudgeResult; unverified: number } {
  const text = normalize(JSON.stringify(summary));
  let unverified = 0;
  const check = (covered: boolean, evidence: string | undefined): boolean => {
    if (!covered) return false;
    if (quotedFrom(evidence, text)) return true;
    unverified += 1;
    return false;
  };
  const ownerless = new Set(gold.actionItems.filter((a) => !a.owner).map((a) => a.id));
  return {
    judge: {
      ...judge,
      topics: judge.topics.map((t) =>
        check(t.coverage !== 'none', t.evidence) ? t : { ...t, coverage: 'none', coveredFacts: [] },
      ),
      crossCutting: judge.crossCutting.map((c) =>
        check(c.gathered || c.coveredOccurrences.length > 0, c.evidence)
          ? c
          : { ...c, gathered: false, coveredOccurrences: [] },
      ),
      decisions: judge.decisions.map((d) => ({ ...d, covered: check(d.covered, d.evidence) })),
      actionItems: judge.actionItems.map((a) => ({
        ...a,
        covered: check(a.covered, a.evidence),
        ownerOk: a.ownerOk || ownerless.has(a.id),
      })),
    },
    unverified,
  };
}

function pointLines(points: ReadonlyArray<GoldPoint>, withOwner: boolean): string[] {
  return points.map((p) =>
    withOwner ? `- ${p.id} [owner: ${p.owner ?? '없음'}] ${p.text}` : `- ${p.id} ${p.text}`,
  );
}

export function buildJudgePrompt(
  gold: Gold,
  summary: unknown,
  scoring: Readonly<Record<string, string>>,
): string {
  const lines: string[] = [];
  lines.push('You grade an AI-written meeting summary against a human answer key.');
  lines.push(
    'The meeting is in Korean and its transcript came from speech recognition. Write evidence and reasons in Korean.',
  );
  lines.push('');
  lines.push('## Grading policy');
  for (const [key, rule] of Object.entries(scoring)) lines.push(`- ${key}: ${rule}`);
  lines.push(
    '- An item counts as covered only if the summary states the same meaning anywhere (title, overview, decisions, actionItems or keyTopics), unless the field rule below says otherwise.',
  );
  lines.push('');
  lines.push('## Glossary (misrecognized form -> real name)');
  for (const [from, to] of Object.entries(gold.glossary)) lines.push(`- ${from} -> ${to}`);
  lines.push('');
  lines.push('## Answer key');
  lines.push('### Topics (grade each: full / partial / none, and list covered fact indices)');
  for (const t of gold.topics.filter((t) => t.tier !== 'noise')) {
    lines.push(`- ${t.id} ${t.topic}`);
    t.facts.forEach((f, i) => lines.push(`  - [${i}] ${f}`));
  }
  lines.push(
    '### Cross-cutting topics (scattered across the meeting; gathered = the summary presents them together as one topic or one group of points)',
  );
  for (const c of gold.crossCutting) {
    lines.push(`- ${c.id} ${c.topic}`);
    c.occurrences.forEach((o, i) => lines.push(`  - [${i}] ${o.fact}`));
  }
  lines.push('### Decisions (covered only if it appears in the summary decisions field)');
  lines.push(...pointLines(gold.decisions, false));
  lines.push(
    '### Action items (covered only if it appears in the summary actionItems field; ownerOk = owner refers to the same person/group, or the key has no owner)',
  );
  lines.push(...pointLines(gold.actionItems, true));
  lines.push('### Not decisions (must not appear in the decisions field)');
  gold.notDecisions.forEach((n) => lines.push(`- ${n.text} — ${n.reason}`));
  lines.push(
    '### Noise (small talk or speech-recognition hallucination; must not appear anywhere)',
  );
  gold.topics.filter((t) => t.tier === 'noise').forEach((t) => lines.push(`- ${t.id} ${t.topic}`));
  gold.noise.forEach((n) => lines.push(`- ${n.text}`));
  lines.push('');
  lines.push('## Summary under test');
  lines.push(JSON.stringify(summary, null, 2));
  lines.push('');
  lines.push('## Output');
  lines.push(
    '- Return one entry for every topic, cross-cutting topic, decision and action item id in the key.',
  );
  lines.push(
    '- Keep it short: evidence is one short quote copied verbatim from "Summary under test" (at most 80 characters, empty if none). Never quote the answer key. List each index at most once.',
  );
  lines.push(
    '- extraDecisions / extraActionItems: summary entries that match no key item. kind = notDecision (matches the not-decisions list), unsupported (not backed by the meeting as described in the key), unlisted (plausible but missing from the key).',
  );
  lines.push('- noiseLeaks: summary text that comes from the noise list.');
  lines.push(
    '- factErrors: statements whose meaning is wrong per the grading policy (wrong owner, mixed-up content, wrong number or date). Do not report typos.',
  );
  return lines.join('\n');
}

function startMs(gold: Gold, id: string): number | undefined {
  const topic = gold.topics.find((t) => t.id === id);
  if (topic) return topic.ms[0]?.[0];
  return [...gold.decisions, ...gold.actionItems].find((p) => p.id === id)?.ms;
}

export function computeMetrics(
  gold: Gold,
  rawJudge: JudgeResult,
  summary: unknown,
  totalMs: number,
): Metrics {
  const { judge, unverified } = verify(gold, rawJudge, summary);
  const graded = gold.topics.filter((t) => t.tier !== 'noise');
  const coverage = new Map(judge.topics.map((t) => [t.id, t]));
  const decided = new Map(judge.decisions.map((d) => [d.id, d]));
  const acted = new Map(judge.actionItems.map((a) => [a.id, a]));

  const topicHits = (tier: 'major' | 'minor' | null, prefix = '') => {
    const pool = graded.filter(
      (t) => (tier === null || t.tier === tier) && t.id.startsWith(prefix),
    );
    const score = pool.reduce((s, t) => s + topicScore(t, coverage.get(t.id)), 0);
    return ratio(score, pool.length);
  };
  const pointHits = (
    points: ReadonlyArray<GoldPoint>,
    hit: (id: string) => boolean,
    prefix = '',
  ) => {
    const pool = points.filter((p) => p.id.startsWith(prefix));
    return ratio(pool.filter((p) => hit(p.id)).length, pool.length);
  };

  const factTotal = graded.reduce((s, t) => s + t.facts.length, 0);
  const factHits = graded.reduce(
    (s, t) => s + new Set(coverage.get(t.id)?.coveredFacts ?? []).size,
    0,
  );

  const ccTotal = gold.crossCutting.reduce((s, c) => s + c.occurrences.length, 0);
  const ccHits = judge.crossCutting.reduce((s, c) => s + new Set(c.coveredOccurrences).size, 0);

  const thirds = [0, 0, 0].map(() => ({ score: 0, total: 0 }));
  const place = (id: string, score: number) => {
    const at = startMs(gold, id);
    if (at === undefined) return;
    const bucket = thirds[Math.min(2, Math.floor((at / totalMs) * 3))];
    bucket.score += score;
    bucket.total += 1;
  };
  graded.forEach((t) => place(t.id, topicScore(t, coverage.get(t.id))));
  gold.decisions.forEach((d) => place(d.id, decided.get(d.id)?.covered ? 1 : 0));
  gold.actionItems.forEach((a) => place(a.id, acted.get(a.id)?.covered ? 1 : 0));

  const ownerPool = gold.actionItems.filter((a) => acted.get(a.id)?.covered);
  return {
    topicsMajor: topicHits('major'),
    topicsMinor: topicHits('minor'),
    facts: ratio(factHits, factTotal),
    decisions: pointHits(gold.decisions, (id) => decided.get(id)?.covered === true),
    actions: pointHits(gold.actionItems, (id) => acted.get(id)?.covered === true),
    actionOwners: ratio(ownerPool.filter((a) => acted.get(a.id)?.ownerOk).length, ownerPool.length),
    crossCuttingGathered: ratio(
      judge.crossCutting.filter((c) => c.gathered).length,
      gold.crossCutting.length,
    ),
    crossCuttingOccurrences: ratio(ccHits, ccTotal),
    early: ratio(thirds[0].score, thirds[0].total),
    middle: ratio(thirds[1].score, thirds[1].total),
    late: ratio(thirds[2].score, thirds[2].total),
    insertTopics: topicHits(null, 'I:'),
    insertDecisions: pointHits(gold.decisions, (id) => decided.get(id)?.covered === true, 'I:'),
    insertActions: pointHits(gold.actionItems, (id) => acted.get(id)?.covered === true, 'I:'),
    notDecisionsAsDecision: judge.extraDecisions.filter((e) => e.kind === 'notDecision').length,
    unsupportedDecisions: judge.extraDecisions.filter((e) => e.kind === 'unsupported').length,
    unsupportedActions: judge.extraActionItems.filter((e) => e.kind === 'unsupported').length,
    noiseLeaks: judge.noiseLeaks.length,
    factErrors: judge.factErrors.length,
    unverified,
  };
}
