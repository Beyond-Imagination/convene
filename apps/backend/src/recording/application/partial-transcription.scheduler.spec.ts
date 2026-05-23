import {
  AbsoluteTranscriptSegment,
  AudioBufferRepository,
  PartialTranscriptStore,
  TranscriberPort,
} from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

import { WAV_HEADER_BYTES } from '../infrastructure/audio-chunker';

import {
  KEEP_LAST_BYTES,
  PartialTranscriptionScheduler,
} from './partial-transcription.scheduler';

interface FakeRepoState {
  activeMeetings: string[];
  participantsByMeeting: Record<string, string[]>;
  drainImpl: (
    code: string,
    pid: string,
  ) => Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }>;
}

const makeRepo = (state: Partial<FakeRepoState> = {}): AudioBufferRepository => ({
  append: async () => {},
  markStarted: async () => {},
  drainAvailable: async (code, pid) => {
    if (!state.drainImpl) return { pcm: Buffer.alloc(0), startMs: 0 };
    return state.drainImpl(code, pid);
  },
  listActiveMeetings: async () => state.activeMeetings ?? [],
  listActiveParticipants: async (code) =>
    state.participantsByMeeting?.[code] ?? [],
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

describe('PartialTranscriptionScheduler.tick', () => {
  it('active 회의가 없으면 transcribe 호출 없음', async () => {
    const repo = makeRepo({ activeMeetings: [] });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(store.appended).toEqual([]);
  });

  it('drain 결과 pcm 이 비어있으면 transcribe 호출 없음', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
    });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(store.appended).toEqual([]);
  });

  it('drain pcm 을 wav 로 wrap 해서 transcribe 호출한다', async () => {
    const pcm = Buffer.alloc(100, 0xab);
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => ({ pcm, startMs: 0, startedAtMs: 1_000_000_000_000 }),
    });
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    const passed = (transcriber.transcribe as jest.Mock).mock.calls[0][0].audio as Buffer;
    expect(passed.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(passed.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('segment 의 startMs/endMs 에 (startedAtMs + chunk.startMs) 가 가산된 AbsoluteTranscriptSegment 가 store 에 append 된다', async () => {
    const startedAtMs = 1_000_000_000_000;
    const chunkStartMs = 28_000;
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => ({
        pcm: Buffer.alloc(100),
        startMs: chunkStartMs,
        startedAtMs,
      }),
    });
    const transcriber = makeTranscriber(() => [
      { text: 'hi', startMs: 500, endMs: 1500 },
      { text: 'bye', startMs: 2000, endMs: 2500 },
    ]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(store.appended).toEqual([
      {
        code: 'abc12xyz',
        segments: [
          {
            speaker: 's1',
            text: 'hi',
            absoluteStartMs: startedAtMs + chunkStartMs + 500,
            absoluteEndMs: startedAtMs + chunkStartMs + 1500,
          },
          {
            speaker: 's1',
            text: 'bye',
            absoluteStartMs: startedAtMs + chunkStartMs + 2000,
            absoluteEndMs: startedAtMs + chunkStartMs + 2500,
          },
        ],
      },
    ]);
  });

  it('여러 회의·participant 를 순서대로 enumerate 한다', async () => {
    const repo = makeRepo({
      activeMeetings: ['aaa11aaa', 'bbb22bbb'],
      participantsByMeeting: { aaa11aaa: ['s1', 's2'], bbb22bbb: ['s3'] },
      drainImpl: async () => ({
        pcm: Buffer.alloc(100),
        startMs: 0,
        startedAtMs: 1_000_000_000_000,
      }),
    });
    const transcriber = makeTranscriber(() => [{ text: 'x', startMs: 0, endMs: 100 }]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(store.appended.map((a) => `${a.code}/${a.segments[0].speaker}`)).toEqual([
      'aaa11aaa/s1',
      'aaa11aaa/s2',
      'bbb22bbb/s3',
    ]);
  });

  it('transcriber 가 throw 해도 swallow — 다른 participant 처리는 계속된다', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1', 's2'] },
      drainImpl: async () => ({
        pcm: Buffer.alloc(100),
        startMs: 0,
        startedAtMs: 1_000_000_000_000,
      }),
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
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(store.appended).toHaveLength(1);
    expect(store.appended[0].segments[0].speaker).toBe('s2');
  });

  it('startedAtMs 가 누락된 경우 originMs=0 으로 처리(epoch ms 기준)', async () => {
    const repo = makeRepo({
      activeMeetings: ['abc12xyz'],
      participantsByMeeting: { abc12xyz: ['s1'] },
      drainImpl: async () => ({ pcm: Buffer.alloc(100), startMs: 5_000 }),
    });
    const transcriber = makeTranscriber(() => [{ text: 'x', startMs: 100, endMs: 500 }]);
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    await scheduler.tick();
    expect(store.appended[0].segments[0]).toEqual({
      speaker: 's1',
      text: 'x',
      absoluteStartMs: 5_100,
      absoluteEndMs: 5_500,
    });
  });
});

describe('PartialTranscriptionScheduler lifecycle', () => {
  it('onModuleInit 가 setInterval 을 띄우고 onModuleDestroy 가 정리한다', () => {
    jest.useFakeTimers();
    const repo = makeRepo();
    const transcriber = makeTranscriber();
    const store = makeStore();
    const scheduler = new PartialTranscriptionScheduler({
      audioBufferRepository: repo,
      transcriber,
      partialTranscriptStore: store,
    });
    scheduler.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);
    scheduler.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('KEEP_LAST_BYTES 가 16kHz pcm_s16le 2초 분량(64000 byte)', () => {
    expect(KEEP_LAST_BYTES).toBe(64_000);
  });
});
