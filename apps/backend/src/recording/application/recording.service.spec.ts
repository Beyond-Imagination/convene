import { REPORT_EVENTS } from '@convene/shared-interfaces';

import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events/report-transcription.payload';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import {
  PCM_BYTES_PER_SECOND,
  WAV_HEADER_BYTES,
  wrapPcmAsWav,
} from '../infrastructure/audio-chunker';
import { RecordingService } from './recording.service';

interface CapturedEvent {
  name: string;
  payload: unknown;
}

const makeEventPublisher = () => {
  const events: CapturedEvent[] = [];
  return {
    events,
    publisher: {
      publish: async (name: string, payload: unknown): Promise<void> => {
        events.push({ name, payload });
      },
    } satisfies Pick<NestEventBusDomainEventPublisher, 'publish'> as NestEventBusDomainEventPublisher,
  };
};

const noopLogger = (): PinoLoggerAdapter => stub<PinoLoggerAdapter>({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

/** transcribe input.audio가 wav(RIFF)인지 가정하고, PCM body의 text 식별값을 돌려준다. */
const wavBodyText = (audio: Buffer): string => audio.subarray(WAV_HEADER_BYTES).toString();

/** chunker가 PCM을 얼마나 잘랐는지 검증할 수 있도록 길이 명시적으로 생성. */
const pcmOfSeconds = (seconds: number, fill = 0): Buffer =>
  Buffer.alloc(seconds * PCM_BYTES_PER_SECOND, fill);

describe('RecordingService.requestTranscription', () => {
  const reportId = 'rep-1';
  const meetingCode = 'abc12xyz';

  const makeService = (
    opts: {
      audios?: ReadonlyArray<{
        participantId: string;
        audio: Buffer;
        startedAtMs?: number;
      }>;
      transcribeImpl?: (input: {
        meetingCode: string;
        audio: Buffer;
      }) => Promise<ReadonlyArray<TranscriptionSegmentPayload>>;
    } = {},
  ) => {
    const consumeMock = jest.fn(async () => opts.audios ?? []);
    const transcribeMock = jest.fn(opts.transcribeImpl ?? (async () => []));
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: consumeMock,
      },
      {
        append: async () => {},
        consume: async () => [],
      },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    return { service, consumeMock, transcribeMock, events };
  };

  it('AudioBuffer.consume을 meetingCode로 호출한다', async () => {
    const { service, consumeMock } = makeService();
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(consumeMock).toHaveBeenCalledWith(meetingCode);
  });

  it('consume 결과가 빈 배열이면 transcribe 호출 없이 빈 transcript로 completed', async () => {
    const { service, transcribeMock, events } = makeService({ audios: [] });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_COMPLETED,
        payload: { reportId, transcript: [] },
      },
    ]);
  });

  it('transcribe에 전달되는 audio는 RIFF WAVE header + PCM으로 wrap 된 wav buffer 다', async () => {
    const { service, transcribeMock } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1, 0xab) }],
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    const passed = transcribeMock.mock.calls[0][0].audio as Buffer;
    expect(passed.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(passed.subarray(8, 12).toString('ascii')).toBe('WAVE');
    // RIFF header 뒤의 PCM body가 원본과 동일
    expect(passed.subarray(WAV_HEADER_BYTES)).toEqual(pcmOfSeconds(1, 0xab));
  });

  it('participant 별 transcribe 결과의 segment에 speaker=participantId가 채워진다', async () => {
    const { service, events } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1) }],
      transcribeImpl: async () => [
        { text: '안녕하세요', startMs: 0, endMs: 1000 },
        { text: '잘 부탁드립니다', startMs: 1000, endMs: 2500 },
      ],
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(events[0]).toEqual({
      name: REPORT_EVENTS.TRANSCRIPTION_COMPLETED,
      payload: {
        reportId,
        transcript: [
          { speaker: 's1', text: '안녕하세요', startMs: 0, endMs: 1000 },
          { speaker: 's1', text: '잘 부탁드립니다', startMs: 1000, endMs: 2500 },
        ],
      },
    });
  });

  it('participantNames가 주어지면 segment의 speaker가 participantId 대신 nickname으로 채워진다', async () => {
    const { service, events } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1) }],
      transcribeImpl: async () => [{ text: '안녕하세요', startMs: 0, endMs: 1000 }],
    });
    await service.requestTranscription({
      reportId,
      meetingCode,
      meetingStartedAtMs: 0,
      participantNames: { s1: '준' },
    });
    expect(events[0]).toEqual({
      name: REPORT_EVENTS.TRANSCRIPTION_COMPLETED,
      payload: {
        reportId,
        transcript: [{ speaker: '준', text: '안녕하세요', startMs: 0, endMs: 1000 }],
      },
    });
  });

  it('participantNames에 매칭되는 항목이 없으면 speaker는 원본 participantId를 유지한다', async () => {
    const { service, events } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1) }],
      transcribeImpl: async () => [{ text: '안녕', startMs: 0, endMs: 1000 }],
    });
    await service.requestTranscription({
      reportId,
      meetingCode,
      meetingStartedAtMs: 0,
      participantNames: { other: '다른사람' },
    });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript[0].speaker).toBe('s1');
  });

  it('partial store의 segment speaker도 participantNames로 nickname 변환된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [],
      },
      {
        append: async () => {},
        consume: async () => [
          {
            speaker: 's2',
            text: 'p0',
            absoluteStartMs: meetingStartedAtMs + 5_000,
            absoluteEndMs: meetingStartedAtMs + 5_500,
          },
        ],
      },
      { transcribe: async () => [] },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({
      reportId,
      meetingCode,
      meetingStartedAtMs,
      participantNames: { s2: '벤' },
    });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: '벤', text: 'p0', startMs: 5_000, endMs: 5_500 },
    ]);
  });

  it('여러 participant의 segment가 startMs 기준 오름차순으로 merge 된다', async () => {
    // 짧은 PCM(1초)은 단일 chunk → chunk offset 0. participant 식별을 fill byte로.
    const pcmA = pcmOfSeconds(1, 0xa1);
    const pcmB = pcmOfSeconds(1, 0xb1);
    const transcribeMock = jest.fn(async ({ audio }: { audio: Buffer }) => {
      const fill = audio[WAV_HEADER_BYTES];
      if (fill === 0xa1) {
        return [
          { text: 'a0', startMs: 0, endMs: 500 },
          { text: 'a2', startMs: 2000, endMs: 2500 },
        ];
      }
      if (fill === 0xb1) {
        return [
          { text: 'b1', startMs: 1000, endMs: 1500 },
          { text: 'b3', startMs: 3000, endMs: 3500 },
        ];
      }
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmA },
          { participantId: 's2', audio: pcmB },
        ],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
      { speaker: 's2', text: 'b1', startMs: 1000, endMs: 1500 },
      { speaker: 's1', text: 'a2', startMs: 2000, endMs: 2500 },
      { speaker: 's2', text: 'b3', startMs: 3000, endMs: 3500 },
    ]);
  });

  it('participant의 startedAtMs가 회의 시작 시각보다 늦으면 segment offset이 +(startedAtMs - meetingStartedAtMs) 만큼 가산된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const s2StartedAtMs = meetingStartedAtMs + 30_000;
    const pcmA = pcmOfSeconds(1, 0xa1);
    const pcmB = pcmOfSeconds(1, 0xb1);
    const transcribeMock = jest.fn(async ({ audio }: { audio: Buffer }) => {
      const fill = audio[WAV_HEADER_BYTES];
      if (fill === 0xa1) return [{ text: 'a0', startMs: 0, endMs: 500 }];
      if (fill === 0xb1) return [{ text: 'b0', startMs: 0, endMs: 800 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmA, startedAtMs: meetingStartedAtMs },
          { participantId: 's2', audio: pcmB, startedAtMs: s2StartedAtMs },
        ],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
      { speaker: 's2', text: 'b0', startMs: 30_000, endMs: 30_800 },
    ]);
  });

  it('30s 이상 PCM은 30s+2s overlap으로 chunk가 나뉘어 transcribe가 N 번 호출되고 segment에 chunk startMs가 가산된다', async () => {
    // 58s PCM → chunk0=[0..30], chunk1=[28..58]
    // chunk1의 segment startMs는 dedup 임계(2000ms)보다 커야 keep 된다.
    const pcm = pcmOfSeconds(58);
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) return [{ text: 'c0', startMs: 1000, endMs: 1500 }];
      if (call === 2) return [{ text: 'c1', startMs: 2500, endMs: 2900 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', audio: pcm }],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).toHaveBeenCalledTimes(2);
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0', startMs: 1000, endMs: 1500 },
      { speaker: 's1', text: 'c1', startMs: 30_500, endMs: 30_900 },
    ]);
  });

  it('잔여 audio가 여러 chunk로 split 될 때 2번째 chunk부터 첫 2초 안 segments는 dedup으로 skip', async () => {
    // 58s PCM → 2 chunks. chunk0의 모든 segment 유지, chunk1의 chunk-local
    // startMs < 2000ms segment는 chunk0의 마지막 overlap과 중복으로 보고 skip.
    const pcm = pcmOfSeconds(58);
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) {
        return [
          { text: 'c0_a', startMs: 1_000, endMs: 1_500 },
          { text: 'c0_last', startMs: 27_000, endMs: 29_500 },
        ];
      }
      if (call === 2) {
        return [
          { text: 'c1_dup', startMs: 100, endMs: 1_800 }, // overlap 안 → skip
          { text: 'c1_keep', startMs: 2_500, endMs: 3_500 },
        ];
      }
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', audio: pcm }],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0_a', startMs: 1_000, endMs: 1_500 },
      { speaker: 's1', text: 'c0_last', startMs: 27_000, endMs: 29_500 },
      // c1_dup은 chunk-local startMs=100 < 2000 → dedup. c1_keep만 유지(absolute=28000+2500=30500).
      { speaker: 's1', text: 'c1_keep', startMs: 30_500, endMs: 31_500 },
    ]);
  });

  it('잔여 audio의 첫 chunk(consume.startMs=0)는 partial 누적이 없었다고 보고 dedup 없이 모든 segment 유지', async () => {
    const pcm = pcmOfSeconds(1);
    const transcribeMock = jest.fn(async () => [
      { text: 'a', startMs: 100, endMs: 500 },
      { text: 'b', startMs: 1_500, endMs: 1_900 },
    ]);
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', audio: pcm }], // startMs 누락 = 0
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a', startMs: 100, endMs: 500 },
      { speaker: 's1', text: 'b', startMs: 1_500, endMs: 1_900 },
    ]);
  });

  it('잔여 audio.startMs>0 (partial scheduler가 사전 drain 함) 이면 첫 chunk도 overlap dedup 적용', async () => {
    // partial scheduler가 이미 처리한 마지막의 끝 2초가 잔여 audio의 첫 2초.
    // → 잔여 audio 첫 chunk의 chunk-local startMs < 2000ms segment는 skip.
    const pcm = pcmOfSeconds(1);
    const transcribeMock = jest.fn(async () => [
      { text: 'dup', startMs: 500, endMs: 1_500 },
      { text: 'keep', startMs: 2_500, endMs: 3_500 },
    ]);
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcm, startMs: 28_000 }, // scheduler가 처리 후 잔여
        ],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    // dup은 28000+500=28500 위치인데 dedup. keep은 28000+2500=30500.
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'keep', startMs: 30_500, endMs: 31_500 },
    ]);
  });

  it('chunk startMs 위에 participant startedAtMs offset도 누적된다(두 보정 동시 적용)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const s1StartedAtMs = meetingStartedAtMs + 10_000; // s1이 10초 늦게 입장
    const pcm = pcmOfSeconds(58); // 2 chunks
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) return [{ text: 'c0', startMs: 0, endMs: 100 }];
      // chunk1의 startMs는 dedup 임계(2000ms)보다 커야 한다.
      if (call === 2) return [{ text: 'c1', startMs: 2500, endMs: 2600 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', audio: pcm, startedAtMs: s1StartedAtMs }],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    // chunk0 startMs=0 + participant offset 10_000 → 10000
    // chunk1 startMs=28_000 + participant offset 10_000 → 38000
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0', startMs: 10_000, endMs: 10_100 },
      { speaker: 's1', text: 'c1', startMs: 40_500, endMs: 40_600 },
    ]);
  });

  it('participant의 startedAtMs가 누락되면 보정 없이 0 offset으로 취급한다(레거시 호환)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmOfSeconds(1) }, // startedAtMs 누락
        ],
      },
      { append: async () => {}, consume: async () => [] },
      {
        transcribe: async () => [{ text: 'a0', startMs: 100, endMs: 400 }],
      },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([{ speaker: 's1', text: 'a0', startMs: 100, endMs: 400 }]);
  });

  it('startedAtMs가 회의 시작보다 이전이면 0으로 clamp 한다(음수 startMs 방지)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const beforeMeetingMs = meetingStartedAtMs - 5_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmOfSeconds(1), startedAtMs: beforeMeetingMs },
        ],
      },
      { append: async () => {}, consume: async () => [] },
      {
        transcribe: async () => [{ text: 'a0', startMs: 0, endMs: 500 }],
      },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([{ speaker: 's1', text: 'a0', startMs: 0, endMs: 500 }]);
  });

  it('PartialTranscriptStore의 누적 segments가 (absolute - meetingStartedAtMs)로 정규화되어 결과에 포함된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [],
      },
      {
        append: async () => {},
        consume: async () => [
          {
            speaker: 's1',
            text: 'p0',
            absoluteStartMs: meetingStartedAtMs + 5_000,
            absoluteEndMs: meetingStartedAtMs + 5_500,
          },
          {
            speaker: 's2',
            text: 'p1',
            absoluteStartMs: meetingStartedAtMs + 8_000,
            absoluteEndMs: meetingStartedAtMs + 8_400,
          },
        ],
      },
      { transcribe: async () => [] },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'p0', startMs: 5_000, endMs: 5_500 },
      { speaker: 's2', text: 'p1', startMs: 8_000, endMs: 8_400 },
    ]);
  });

  it('partial store segments와 잔여 audio segments가 시간순으로 merge 된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const participantStartedAtMs = meetingStartedAtMs; // 회의 시작과 동시
    const partialSeg = {
      speaker: 's1',
      text: 'p_early',
      absoluteStartMs: meetingStartedAtMs + 10_000,
      absoluteEndMs: meetingStartedAtMs + 10_500,
    };
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          {
            participantId: 's1',
            audio: pcmOfSeconds(1),
            startedAtMs: participantStartedAtMs,
            // 잔여 audio 시작 위치 = scheduler가 사전 drain 한 양 = 25000ms
            startMs: 25_000,
          },
        ],
      },
      {
        append: async () => {},
        consume: async () => [partialSeg],
      },
      {
        // 잔여 chunk의 STT 결과. partial scheduler가 사전 drain 했으므로 첫 chunk
        // 라도 chunk-local startMs<2000 segment는 dedup. tail은 2000 이상이라 keep.
        transcribe: async () => [{ text: 'tail', startMs: 2500, endMs: 3000 }],
      },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      // partial: absoluteStartMs - meetingStartedAtMs = 10000
      { speaker: 's1', text: 'p_early', startMs: 10_000, endMs: 10_500 },
      // 잔여: startedAt + consume.startMs + chunk0.startMs + seg.startMs = 0 + 25000 + 0 + 2500 = 27500
      { speaker: 's1', text: 'tail', startMs: 27_500, endMs: 28_000 },
    ]);
  });

  it('Transcriber가 throw 하면 report.transcription.failed를 error 메시지와 함께 발행한다', async () => {
    const { service, events } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1) }],
      transcribeImpl: async () => {
        throw new Error('ai-worker 503');
      },
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_FAILED,
        payload: { reportId, error: 'ai-worker 503' },
      },
    ]);
  });

  it('실패해도 throw 하지 않는다', async () => {
    const { service } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1) }],
      transcribeImpl: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 }),
    ).resolves.toBeUndefined();
  });
});

// wavBodyText / wrapPcmAsWav는 import만 해도 트리쉐이크 방지가 충분하지만 lint
// 에서 unused로 잡힐 수 있어 명시적으로 사용한다.
void wavBodyText;
void wrapPcmAsWav;
