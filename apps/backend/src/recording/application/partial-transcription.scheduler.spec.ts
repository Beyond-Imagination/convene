import { AudioBufferRepository, AudioRun } from '@/recording/domain/ports/audio-buffer.repository';
import { AbsoluteTranscriptSegment, PartialTranscriptStore } from '@/recording/domain/ports/partial-transcript.store';
import { TranscriberPort } from '@/recording/domain/ports/transcriber.port';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import { BATCH_SPEECH_BUDGET_MS, WAV_HEADER_BYTES } from '../infrastructure/audio-chunker';
import {
  KEEP_LAST_BYTES,
  PARTIAL_INTERVAL_MS,
  PartialTranscriptionScheduler,
} from './partial-transcription.scheduler';

interface FakeRepoState {
  activeMeetings: string[];
  participantsByMeeting: Record<string, string[]>;
  drainImpl: (code: string, pid: string) => Promise<ReadonlyArray<AudioRun>>;
}

/** 무음 필터에 걸리지 않도록 발화 수준 진폭을 채운 PCM. */
const audible = (bytes: number): Buffer => {
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i + 1 < bytes; i += 2) buf.writeInt16LE(6_000, i);
  return buf;
};

const makeRepo = (state: Partial<FakeRepoState> = {}): AudioBufferRepository => ({
  append: async () => {},
  drainAvailable: async (code, pid) => {
    if (!state.drainImpl) return [];
    return state.drainImpl(code, pid);
  },
  listActiveMeetings: async () => state.activeMeetings ?? [],
  listActiveParticipants: async (code) => state.participantsByMeeting?.[code] ?? [],
  consume: async () => [],
});

const makeTranscriber = (
  impl: (audio: Buffer) => ReadonlyArray<TranscriptionSegmentPayload> = () => [],
): TranscriberPort => ({
  transcribe: jest.fn(async ({ audio }) => impl(audio)) as any,
});

const makeStore = (): PartialTranscriptStore & {
  appended: Array<{ code: string; segments: ReadonlyArray<AbsoluteTranscriptSegment> }>;
} => {
  const appended: Array<{
    code: string;
    segments: ReadonlyArray<AbsoluteTranscriptSegment>;
  }> = [];
  return {
    appended,
    append: async (code, segments) => {
      appended.push({ code, segments });
    },
    consume: async () => [],
  };
};

const noopLogger = (): PinoLoggerAdapter => stub<PinoLoggerAdapter>({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('PartialTranscriptionScheduler.tick', () => {
  it('active 회의가 없으면 transcribe 호출 없음', async () => {
    const repo = makeRepo({ activeMeetings: [] });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(store.appended).toEqual([]);
  });

  it('drain 결과 pcm이 비어있으면 transcribe 호출 없음', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: Buffer.alloc(0), startedAtMs: 0 }],
    });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(store.appended).toEqual([]);
  });

  it('무음뿐인 run 은 전사에 보내지 않는다 — 마이크만 켜 두면 무음이 계속 쌓인다', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: Buffer.alloc(32_000), startedAtMs: 1_000 }],
    });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(repo, transcriber, store, noopLogger());
    await scheduler.tick();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });

  it('무음 run 은 걸러도 발화 run 은 남긴다', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [
        { pcm: Buffer.alloc(32_000), startedAtMs: 1_000 },
        { pcm: audible(32_000), startedAtMs: 40_000 },
      ],
    });
    const transcriber = makeTranscriber(() => [{ text: 'x', startMs: 0, endMs: 100 }]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(repo, transcriber, store, noopLogger());
    await scheduler.tick();
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    expect(store.appended[0].segments[0].absoluteStartMs).toBe(40_000);
  });

  it('drain pcm을 wav로 wrap 해서 transcribe 호출한다', async () => {
    const pcm = audible(100);
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm, startedAtMs: 1_000_000_000_000 }],
    });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    const passed = (transcriber.transcribe as jest.Mock).mock.calls[0][0].audio as Buffer;
    expect(passed.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(passed.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('drain 주기가 배치 발화 예산을 넘지 않는다 — 넘으면 한 번 걷은 오디오가 배치로 갈린다', () => {
    expect(PARTIAL_INTERVAL_MS).toBeLessThanOrEqual(BATCH_SPEECH_BUDGET_MS);
  });

  it('segment의 startMs/endMs에 run의 절대 시각이 가산돼 store에 append 된다', async () => {
    const startedAtMs = 1_000_000_000_000;
    const chunkStartMs = 28_000;
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: startedAtMs + chunkStartMs }],
    });
    const transcriber = makeTranscriber(() => [
      { text: 'hi', startMs: 2500, endMs: 3000 },
      { text: 'bye', startMs: 4000, endMs: 4500 },
    ]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(store.appended).toEqual([
      {
        code: 'abc12xyz',
        segments: [
          {
            speaker: 's1',
            text: 'hi',
            absoluteStartMs: startedAtMs + chunkStartMs + 2500,
            absoluteEndMs: startedAtMs + chunkStartMs + 3000,
          },
          {
            speaker: 's1',
            text: 'bye',
            absoluteStartMs: startedAtMs + chunkStartMs + 4000,
            absoluteEndMs: startedAtMs + chunkStartMs + 4500,
          },
        ],
      },
    ]);
  });

  it('여러 회의·participant를 순서대로 enumerate 한다', async () => {
    const repo = makeRepo({
      activeMeetings: ['aaa11aaa', 'bbb22bbb'],
      participantsByMeeting: { aaa11aaa: ['s1', 's2'], bbb22bbb: ['s3'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: 1_000_000_000_000 }],
    });
    const transcriber = makeTranscriber(() => [{ text: 'x', startMs: 0, endMs: 100 }]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(store.appended.map((a) => `${a.code}/${a.segments[0].speaker}`)).toEqual([
      'aaa11aaa/s1',
      'aaa11aaa/s2',
      'bbb22bbb/s3',
    ]);
  });

  it('transcriber가 throw 해도 swallow — 다른 participant 처리는 계속된다', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1', 's2'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: 1_000_000_000_000 }],
    });
    const transcriber: TranscriberPort = {
      transcribe: jest
        .fn()
        .mockImplementationOnce(async () => {
          throw new Error('ai-worker 503');
        })
        .mockImplementationOnce(async () => [{ text: 'x', startMs: 0, endMs: 100 }]),
    };
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(store.appended).toHaveLength(1);
    expect(store.appended[0].segments[0].speaker).toBe('s2');
  });

  it('drain 간 구간이 겹치지 않으므로 앞부분 segment도 버리지 않는다', async () => {
    const startedAtMs = 1_000_000_000_000;
    const chunkStartMs = 28_000; // 두 번째 이상 partial 호출
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: startedAtMs + chunkStartMs }],
    });
    // 직전 drain 이 남긴 꼬리는 전사되지 않은 채 넘어온 것이라 중복이 아니다.
    // 여기서 앞 2초를 버리면 매 drain 마다 그만큼 발화가 사라진다.
    const transcriber = makeTranscriber(() => [
      { text: 'head', startMs: 500, endMs: 1_500 },
      { text: 'head2', startMs: 1_999, endMs: 2_000 },
      { text: 'keep', startMs: 2_000, endMs: 3_000 },
      { text: 'keep2', startMs: 5_000, endMs: 6_000 },
    ]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(store.appended[0].segments.map((s) => s.text)).toEqual([
      'head',
      'head2',
      'keep',
      'keep2',
    ]);
  });

  it('run 첫 drain 의 모든 segment 를 유지한다', async () => {
    const startedAtMs = 1_000_000_000_000;
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: startedAtMs + 0 }],
    });
    const transcriber = makeTranscriber(() => [
      { text: 'first', startMs: 500, endMs: 1_500 },
      { text: 'second', startMs: 1_999, endMs: 2_000 },
      { text: 'third', startMs: 2_000, endMs: 3_000 },
    ]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(store.appended[0].segments.map((s) => s.text)).toEqual(['first', 'second', 'third']);
  });

  it('run 의 절대 시각이 그대로 segment 시각의 기준이 된다', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => [{ pcm: audible(100), startedAtMs: 5_000 }],
    });
    const transcriber = makeTranscriber(() => [{ text: 'x', startMs: 2_500, endMs: 3_000 }]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    await scheduler.tick();
    expect(store.appended[0].segments[0]).toEqual({
      speaker: 's1',
      text: 'x',
      absoluteStartMs: 7_500,
      absoluteEndMs: 8_000,
    });
  });
});

describe('PartialTranscriptionScheduler lifecycle', () => {
  it('onModuleInit가 setInterval을 띄우고 onModuleDestroy가 정리한다', () => {
    jest.useFakeTimers();
    const repo = makeRepo();
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler(
      repo,
      transcriber,
      store,
      noopLogger(),
    );
    scheduler.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);
    scheduler.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('KEEP_LAST_BYTES가 16kHz pcm_s16le 2초 분량(64000 byte)', () => {
    expect(KEEP_LAST_BYTES).toBe(64_000);
  });
});
