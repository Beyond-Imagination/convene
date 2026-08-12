import { REPORT_EVENTS } from '@convene/shared-interfaces';

import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import {
  DEFAULT_CHUNK_MS,
  DEFAULT_OVERLAP_MS,
  PCM_BYTES_PER_SECOND,
  WAV_HEADER_BYTES,
  wrapPcmAsWav,
} from '../infrastructure/audio-chunker';
import { RecordingService } from './recording.service';

/** chunk N+1 이 시작하는 지점. chunk 길이가 바뀌어도 스펙이 따라가게 상수에서 끌어온다. */
const CHUNK_STEP_MS = DEFAULT_CHUNK_MS - DEFAULT_OVERLAP_MS;
/** chunk 가 정확히 2개로 갈리는 PCM 길이(step 을 한 번 넘고 꼬리가 남는다). */
const TWO_CHUNK_SECONDS = CHUNK_STEP_MS / 1000 + 10;

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
    // consume 은 이제 run 단위로 돌려준다. 기존 케이스는 연속된 run 하나로 본다.
    const consumeMock = jest.fn(async () =>
      (opts.audios ?? []).map(({ participantId, audio, startedAtMs }) => ({
        participantId,
        runs: [{ pcm: audio, startedAtMs: startedAtMs ?? 0 }],
      })),
    );
    const transcribeMock = jest.fn(opts.transcribeImpl ?? (async () => []));
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        drainAvailable: async () => [],
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
        drainAvailable: async () => [],
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', runs: [{ pcm: pcmA, startedAtMs: 0 }] },
          { participantId: 's2', runs: [{ pcm: pcmB, startedAtMs: 0 }] },
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', runs: [{ pcm: pcmA, startedAtMs: meetingStartedAtMs }] },
          { participantId: 's2', runs: [{ pcm: pcmB, startedAtMs: s2StartedAtMs }] },
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

  it('chunk 길이를 넘는 PCM은 overlap 을 두고 나뉘어 transcribe가 N 번 호출되고 segment에 chunk startMs가 가산된다', async () => {
    // chunk1 의 segment startMs 는 dedup 임계(overlapMs)보다 커야 keep 된다.
    const pcm = pcmOfSeconds(TWO_CHUNK_SECONDS);
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', runs: [{ pcm: pcm, startedAtMs: 0 }] }],
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
      { speaker: 's1', text: 'c1', startMs: CHUNK_STEP_MS + 2_500, endMs: CHUNK_STEP_MS + 2_900 },
    ]);
  });

  it('잔여 audio가 여러 chunk로 split 될 때 2번째 chunk부터 overlap 안 segments는 dedup으로 skip', async () => {
    // chunk0의 모든 segment 유지, chunk1의 chunk-local startMs < overlapMs segment 는
    // chunk0의 마지막 overlap 과 중복으로 보고 skip.
    const pcm = pcmOfSeconds(TWO_CHUNK_SECONDS);
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', runs: [{ pcm: pcm, startedAtMs: 0 }] }],
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
      // c1_dup 은 chunk-local startMs 가 overlap 안이라 dedup. c1_keep 만 chunk offset 을 얹어 남는다.
      {
        speaker: 's1',
        text: 'c1_keep',
        startMs: CHUNK_STEP_MS + 2_500,
        endMs: CHUNK_STEP_MS + 3_500,
      },
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', runs: [{ pcm: pcm, startedAtMs: 0 }] }], // startMs 누락 = 0
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

  it('scheduler 가 남긴 잔여 run 의 앞부분도 버리지 않는다', async () => {
    // scheduler 는 꼬리를 전사하지 않고 남긴 것이라 중복이 아니다.
    const pcm = pcmOfSeconds(1);
    const transcribeMock = jest.fn(async () => [
      { text: 'head', startMs: 500, endMs: 1_500 },
      { text: 'keep', startMs: 2_500, endMs: 3_500 },
    ]);
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', runs: [{ pcm, startedAtMs: 28_000 }] }, // scheduler 가 처리하고 남긴 잔여
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
      { speaker: 's1', text: 'head', startMs: 28_500, endMs: 29_500 },
      { speaker: 's1', text: 'keep', startMs: 30_500, endMs: 31_500 },
    ]);
  });

  it('run 의 절대 시각 위에 chunk offset 이 누적된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const s1StartedAtMs = meetingStartedAtMs + 10_000; // s1이 10초 늦게 입장
    const pcm = pcmOfSeconds(TWO_CHUNK_SECONDS);
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) return [{ text: 'c0', startMs: 0, endMs: 100 }];
      if (call === 2) return [{ text: 'c1', startMs: 2500, endMs: 2600 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', runs: [{ pcm, startedAtMs: s1StartedAtMs }] }],
      },
      { append: async () => {}, consume: async () => [] },
      { transcribe: transcribeMock },
      publisher,
      noopLogger(),
    );
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    // c0 = run 시작(회의 +10초) + chunk0 offset 0, c1 = 거기에 chunk1 offset + seg 2_500.
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0', startMs: 10_000, endMs: 10_100 },
      {
        speaker: 's1',
        text: 'c1',
        startMs: 10_000 + CHUNK_STEP_MS + 2_500,
        endMs: 10_000 + CHUNK_STEP_MS + 2_600,
      },
    ]);
  });

  it('run 이 회의 시작보다 이전에 시작했으면 0으로 clamp 한다(음수 startMs 방지)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const beforeMeetingMs = meetingStartedAtMs - 5_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService(
      {
        append: async () => {},
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', runs: [{ pcm: pcmOfSeconds(1), startedAtMs: beforeMeetingMs }] },
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
        drainAvailable: async () => [],
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
        drainAvailable: async () => [],
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          {
            participantId: 's1',
            // scheduler 가 25초 지점까지 처리하고 남긴 잔여 run.
            runs: [{ pcm: pcmOfSeconds(1), startedAtMs: participantStartedAtMs + 25_000 }],
          },
        ],
      },
      {
        append: async () => {},
        consume: async () => [partialSeg],
      },
      {
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
      // 잔여: run 시작(회의 +25초) + chunk0 offset 0 + seg 2500 = 27500
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
