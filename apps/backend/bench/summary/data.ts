import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import mongoose from 'mongoose';

import { TranscriptSegment } from '@/reports/domain/entries/transcript-segment';
import { SummarizerInput } from '@/reports/domain/ports/summarizer.port';
import { MEETING_REPORT_COLLECTION } from '@/reports/infrastructure/meeting-report.schema';

export type Tier = 'major' | 'minor' | 'noise';

export interface GoldTopic {
  readonly id: string;
  readonly tier: Tier;
  readonly ms: ReadonlyArray<readonly [number, number]>;
  readonly topic: string;
  readonly facts: ReadonlyArray<string>;
}

export interface GoldCrossCutting {
  readonly id: string;
  readonly topic: string;
  readonly occurrences: ReadonlyArray<{ readonly ms: number; readonly fact: string }>;
}

/** 결정·액션 공통. 액션 정답 파일의 `task`는 읽을 때 `text`로 옮긴다. */
export interface GoldPoint {
  readonly id: string;
  readonly ms: number;
  readonly text: string;
  readonly owner?: string | null;
}

export interface Gold {
  readonly glossary: Readonly<Record<string, string>>;
  readonly topics: ReadonlyArray<GoldTopic>;
  readonly crossCutting: ReadonlyArray<GoldCrossCutting>;
  readonly decisions: ReadonlyArray<GoldPoint>;
  readonly notDecisions: ReadonlyArray<{ readonly text: string; readonly reason: string }>;
  readonly actionItems: ReadonlyArray<GoldPoint>;
  readonly noise: ReadonlyArray<{ readonly ms: readonly [number, number]; readonly text: string }>;
}

export interface Variant {
  readonly id: string;
  readonly insertAtMs?: number;
}

export interface VariantConfig {
  readonly host: string;
  readonly insert: string;
  readonly insertSpanMs: readonly [number, number];
  readonly gapMs: number;
  readonly variants: ReadonlyArray<Variant>;
  readonly scoring: Readonly<Record<string, string>>;
}

export interface BenchInput {
  readonly id: string;
  readonly input: SummarizerInput;
  readonly gold: Gold;
  readonly totalMs: number;
  /** 이어 붙인 입력이면 host·insert 정답 id에 `H:`·`I:`가 붙는다. */
  readonly stitched: boolean;
  /** 운영에서 이미 만들어진 요약. 이어 붙인 입력에는 없다. */
  readonly prodSummary: unknown;
}

/** Mongo 문서에서 벤치에 필요한 필드만 옮긴 것. 실제 회의 내용이라 커밋하지 않는 data/에만 둔다. */
interface StoredMeeting {
  readonly code: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly transcript: ReadonlyArray<TranscriptSegment>;
  readonly chat: ReadonlyArray<{ nickname: string; text: string; sentAt: string }>;
  readonly prodSummary: unknown;
}

interface RawReport {
  startedAt: Date;
  endedAt: Date;
  transcript?: Array<{ speaker?: string; text: string; startMs: number; endMs: number }>;
  chat?: Array<{ nickname: string; text: string; sentAt: Date }>;
  summary?: unknown;
}

interface RawGold {
  glossary?: Record<string, string>;
  topics: GoldTopic[];
  crossCutting?: GoldCrossCutting[];
  decisions: Array<{ id: string; ms: number; text: string }>;
  notDecisions?: Array<{ text: string; reason: string }>;
  actionItems: Array<{ id: string; ms: number; task: string; owner?: string | null }>;
  noise?: Array<{ ms: [number, number]; text: string }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadMeeting(dataDir: string, code: string): StoredMeeting {
  return readJson<StoredMeeting>(join(dataDir, 'meetings', `${code}.json`));
}

function loadGold(dataDir: string, code: string): Gold {
  const raw = readJson<RawGold>(join(dataDir, 'gold', `${code}.json`));
  return {
    glossary: raw.glossary ?? {},
    topics: raw.topics,
    crossCutting: raw.crossCutting ?? [],
    decisions: raw.decisions.map((d) => ({ id: d.id, ms: d.ms, text: d.text })),
    notDecisions: raw.notDecisions ?? [],
    actionItems: raw.actionItems.map((a) => ({
      id: a.id,
      ms: a.ms,
      text: a.task,
      owner: a.owner ?? null,
    })),
    noise: raw.noise ?? [],
  };
}

function durationMs(meeting: StoredMeeting): number {
  return Date.parse(meeting.endedAt) - Date.parse(meeting.startedAt);
}

function toInput(id: string, meeting: StoredMeeting): SummarizerInput {
  return {
    transcript: meeting.transcript,
    chat: meeting.chat.map((c) => ({ ...c, sentAt: new Date(c.sentAt) })),
    meta: {
      meetingId: id,
      code: id,
      startedAt: new Date(meeting.startedAt),
      endedAt: new Date(meeting.endedAt),
    },
  };
}

function remapGold(gold: Gold, prefix: string, map: (ms: number) => number): Gold {
  const point = (p: GoldPoint): GoldPoint => ({ ...p, id: prefix + p.id, ms: map(p.ms) });
  return {
    glossary: gold.glossary,
    topics: gold.topics.map((t) => ({
      ...t,
      id: prefix + t.id,
      ms: t.ms.map(([s, e]) => [map(s), map(e)] as const),
    })),
    crossCutting: gold.crossCutting.map((c) => ({
      ...c,
      id: prefix + c.id,
      occurrences: c.occurrences.map((o) => ({ ...o, ms: map(o.ms) })),
    })),
    decisions: gold.decisions.map(point),
    notDecisions: gold.notDecisions,
    actionItems: gold.actionItems.map(point),
    noise: gold.noise.map((n) => ({ ...n, ms: [map(n.ms[0]), map(n.ms[1])] as const })),
  };
}

function mergeGold(a: Gold, b: Gold): Gold {
  return {
    glossary: { ...a.glossary, ...b.glossary },
    topics: [...a.topics, ...b.topics],
    crossCutting: [...a.crossCutting, ...b.crossCutting],
    decisions: [...a.decisions, ...b.decisions],
    notDecisions: [...a.notDecisions, ...b.notDecisions],
    actionItems: [...a.actionItems, ...b.actionItems],
    noise: [...a.noise, ...b.noise],
  };
}

/**
 * insert 회의를 host의 `insertAtMs` 지점에 끼운다.
 * insert는 [insertAt+gap, insertAt+gap+len]에 놓이고, 그 뒤 host는 len+2·gap만큼 밀린다.
 */
function stitch(dataDir: string, config: VariantConfig, variant: Variant): BenchInput {
  const host = loadMeeting(dataDir, config.host);
  const insert = loadMeeting(dataDir, config.insert);
  const insertAt = variant.insertAtMs ?? 0;
  const [spanStart, spanEnd] = config.insertSpanMs;
  const shift = spanEnd - spanStart + 2 * config.gapMs;
  const hostMap = (ms: number): number => (ms >= insertAt ? ms + shift : ms);
  const insertMap = (ms: number): number => ms - spanStart + insertAt + config.gapMs;

  const startedAt = Date.parse(host.startedAt);
  const totalMs = durationMs(host) + shift;
  const remapChat = (meeting: StoredMeeting, map: (ms: number) => number) =>
    meeting.chat.map((c) => ({
      nickname: c.nickname,
      text: c.text,
      sentAt: new Date(startedAt + map(Date.parse(c.sentAt) - Date.parse(meeting.startedAt))),
    }));
  const remapSegments = (meeting: StoredMeeting, map: (ms: number) => number) =>
    meeting.transcript.map((s) => ({ ...s, startMs: map(s.startMs), endMs: map(s.endMs) }));

  return {
    id: variant.id,
    input: {
      transcript: [...remapSegments(host, hostMap), ...remapSegments(insert, insertMap)].sort(
        (a, b) => a.startMs - b.startMs,
      ),
      chat: [...remapChat(host, hostMap), ...remapChat(insert, insertMap)].sort(
        (a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
      ),
      meta: {
        meetingId: variant.id,
        code: variant.id,
        startedAt: new Date(startedAt),
        endedAt: new Date(startedAt + totalMs),
      },
    },
    gold: mergeGold(
      remapGold(loadGold(dataDir, config.host), 'H:', hostMap),
      remapGold(loadGold(dataDir, config.insert), 'I:', insertMap),
    ),
    totalMs,
    stitched: true,
    prodSummary: null,
  };
}

export function loadVariantConfig(dataDir: string): VariantConfig {
  return readJson<VariantConfig>(join(dataDir, 'gold', 'variants.json'));
}

/** `id`는 회의 코드(단일 회의) 또는 variants.json의 variant id. `solo`는 insert 회의 단독. */
export function loadBenchInput(dataDir: string, id: string): BenchInput {
  const config = loadVariantConfig(dataDir);
  const variant = config.variants.find((v) => v.id === id);
  if (variant && variant.insertAtMs !== undefined) return stitch(dataDir, config, variant);

  const code = variant ? config.insert : id;
  const meeting = loadMeeting(dataDir, code);
  return {
    id,
    input: toInput(id, meeting),
    gold: loadGold(dataDir, code),
    totalMs: durationMs(meeting),
    stitched: false,
    prodSummary: meeting.prodSummary,
  };
}

export async function exportMeetings(
  dataDir: string,
  codes: ReadonlyArray<string>,
  uri: string,
  dbName: string,
): Promise<void> {
  mkdirSync(join(dataDir, 'meetings'), { recursive: true });
  await mongoose.connect(uri, { dbName });
  try {
    const collection = mongoose.connection.collection<RawReport>(MEETING_REPORT_COLLECTION);
    for (const code of codes) {
      const doc = await collection.findOne({ code }, { sort: { endedAt: -1 } });
      if (!doc) {
        const total = await collection.estimatedDocumentCount();
        throw new Error(
          `meeting report not found: ${code} (host=${mongoose.connection.host}, db=${dbName}, ${MEETING_REPORT_COLLECTION} ${total}건)`,
        );
      }
      const meeting: StoredMeeting = {
        code,
        startedAt: doc.startedAt.toISOString(),
        endedAt: doc.endedAt.toISOString(),
        transcript: (doc.transcript ?? []).map((s) => ({
          speaker: s.speaker,
          text: s.text,
          startMs: s.startMs,
          endMs: s.endMs,
        })),
        chat: (doc.chat ?? []).map((c) => ({
          nickname: c.nickname,
          text: c.text,
          sentAt: new Date(c.sentAt).toISOString(),
        })),
        prodSummary: doc.summary ?? null,
      };
      writeFileSync(join(dataDir, 'meetings', `${code}.json`), JSON.stringify(meeting, null, 2));
      console.log(`exported ${code}: ${meeting.transcript.length} segments`);
    }
  } finally {
    await mongoose.disconnect();
  }
}
