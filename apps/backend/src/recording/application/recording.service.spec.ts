import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

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
    },
  };
};

/** transcribe input.audio 가 wav(RIFF) 인지 가정하고, PCM body 의 text 식별값을 돌려준다. */
const wavBodyText = (audio: Buffer): string =>
  audio.subarray(WAV_HEADER_BYTES).toString();

/** chunker 가 PCM 을 얼마나 잘랐는지 검증할 수 있도록 길이 명시적으로 생성. */
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
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: consumeMock,
      },
      partialTranscriptStore: {
        append: async () => {},
        consume: async () => [],
      },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    return { service, consumeMock, transcribeMock, events };
  };

  it('AudioBuffer.consume 을 meetingCode 로 호출한다', async () => {
    const { service, consumeMock } = makeService();
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(consumeMock).toHaveBeenCalledWith(meetingCode);
  });

  it('consume 결과가 빈 배열이면 transcribe 호출 없이 빈 transcript 로 completed', async () => {
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

  it('transcribe 에 전달되는 audio 는 RIFF WAVE header + PCM 으로 wrap 된 wav buffer 다', async () => {
    const { service, transcribeMock } = makeService({
      audios: [{ participantId: 's1', audio: pcmOfSeconds(1, 0xab) }],
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).toHaveBeenCalledTimes(1);
    const passed = transcribeMock.mock.calls[0][0].audio as Buffer;
    expect(passed.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(passed.subarray(8, 12).toString('ascii')).toBe('WAVE');
    // RIFF header 뒤의 PCM body 가 원본과 동일
    expect(passed.subarray(WAV_HEADER_BYTES)).toEqual(pcmOfSeconds(1, 0xab));
  });

  it('participant 별 transcribe 결과의 segment 에 speaker=participantId 가 채워진다', async () => {
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

  it('여러 participant 의 segment 가 startMs 기준 오름차순으로 merge 된다', async () => {
    // 짧은 PCM(1초) 은 단일 chunk → chunk offset 0. participant 식별을 fill byte 로.
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
    const service = new RecordingService({
      audioBufferRepository: {
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
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
      { speaker: 's2', text: 'b1', startMs: 1000, endMs: 1500 },
      { speaker: 's1', text: 'a2', startMs: 2000, endMs: 2500 },
      { speaker: 's2', text: 'b3', startMs: 3000, endMs: 3500 },
    ]);
  });

  it('participant 의 startedAtMs 가 회의 시작 시각보다 늦으면 segment offset 이 +(startedAtMs - meetingStartedAtMs) 만큼 가산된다', async () => {
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
    const service = new RecordingService({
      audioBufferRepository: {
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
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
      { speaker: 's2', text: 'b0', startMs: 30_000, endMs: 30_800 },
    ]);
  });

  it('30s 이상 PCM 은 30s+2s overlap 으로 chunk 가 나뉘어 transcribe 가 N 번 호출되고 segment 에 chunk startMs 가 가산된다', async () => {
    // 58s PCM → chunk0=[0..30], chunk1=[28..58]
    const pcm = pcmOfSeconds(58);
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) return [{ text: 'c0', startMs: 1000, endMs: 1500 }];
      if (call === 2) return [{ text: 'c1', startMs: 500, endMs: 900 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [{ participantId: 's1', audio: pcm }],
      },
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).toHaveBeenCalledTimes(2);
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0', startMs: 1000, endMs: 1500 },
      { speaker: 's1', text: 'c1', startMs: 28_500, endMs: 28_900 },
    ]);
  });

  it('chunk startMs 위에 participant startedAtMs offset 도 누적된다(두 보정 동시 적용)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const s1StartedAtMs = meetingStartedAtMs + 10_000; // s1 이 10초 늦게 입장
    const pcm = pcmOfSeconds(58); // 2 chunks
    let call = 0;
    const transcribeMock = jest.fn(async () => {
      call += 1;
      if (call === 1) return [{ text: 'c0', startMs: 0, endMs: 100 }];
      if (call === 2) return [{ text: 'c1', startMs: 0, endMs: 100 }];
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcm, startedAtMs: s1StartedAtMs },
        ],
      },
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    // chunk0 startMs=0 + participant offset 10_000 → 10000
    // chunk1 startMs=28_000 + participant offset 10_000 → 38000
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'c0', startMs: 10_000, endMs: 10_100 },
      { speaker: 's1', text: 'c1', startMs: 38_000, endMs: 38_100 },
    ]);
  });

  it('participant 의 startedAtMs 가 누락되면 보정 없이 0 offset 으로 취급한다(레거시 호환)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmOfSeconds(1) }, // startedAtMs 누락
        ],
      },
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: {
        transcribe: async () => [{ text: 'a0', startMs: 100, endMs: 400 }],
      },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 100, endMs: 400 },
    ]);
  });

  it('startedAtMs 가 회의 시작보다 이전이면 0 으로 clamp 한다(음수 startMs 방지)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const beforeMeetingMs = meetingStartedAtMs - 5_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [
          { participantId: 's1', audio: pcmOfSeconds(1), startedAtMs: beforeMeetingMs },
        ],
      },
      partialTranscriptStore: { append: async () => {}, consume: async () => [] },
      transcriber: {
        transcribe: async () => [{ text: 'a0', startMs: 0, endMs: 500 }],
      },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
    ]);
  });

  it('PartialTranscriptStore 의 누적 segments 가 (absolute - meetingStartedAtMs) 로 정규화되어 결과에 포함된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        drainAvailable: async () => ({ pcm: Buffer.alloc(0), startMs: 0 }),
        listActiveMeetings: async () => [],
        listActiveParticipants: async () => [],
        consume: async () => [],
      },
      partialTranscriptStore: {
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
      transcriber: { transcribe: async () => [] },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'p0', startMs: 5_000, endMs: 5_500 },
      { speaker: 's2', text: 'p1', startMs: 8_000, endMs: 8_400 },
    ]);
  });

  it('partial store segments 와 잔여 audio segments 가 시간순으로 merge 된다', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const participantStartedAtMs = meetingStartedAtMs; // 회의 시작과 동시
    const partialSeg = {
      speaker: 's1',
      text: 'p_early',
      absoluteStartMs: meetingStartedAtMs + 10_000,
      absoluteEndMs: meetingStartedAtMs + 10_500,
    };
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
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
            // 잔여 audio 시작 위치 = scheduler 가 사전 drain 한 양 = 25000ms
            startMs: 25_000,
          },
        ],
      },
      partialTranscriptStore: {
        append: async () => {},
        consume: async () => [partialSeg],
      },
      transcriber: {
        // 잔여 chunk 의 STT 결과 — chunk audio 0ms 지점에 발화
        transcribe: async () => [{ text: 'tail', startMs: 100, endMs: 600 }],
      },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs });
    const payload = events[0].payload as { transcript: TranscriptionSegmentPayload[] };
    expect(payload.transcript).toEqual([
      // partial: absoluteStartMs - meetingStartedAtMs = 10000
      { speaker: 's1', text: 'p_early', startMs: 10_000, endMs: 10_500 },
      // 잔여: startedAt + consume.startMs + chunk0.startMs + seg.startMs = 0 + 25000 + 0 + 100 = 25100
      { speaker: 's1', text: 'tail', startMs: 25_100, endMs: 25_600 },
    ]);
  });

  it('Transcriber 가 throw 하면 report.transcription.failed 를 error 메시지와 함께 발행한다', async () => {
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

// wavBodyText / wrapPcmAsWav 는 import 만 해도 트리쉐이크 방지가 충분하지만 lint
// 에서 unused 로 잡힐 수 있어 명시적으로 사용한다(추후 chunk 검증 케이스 확장 시 활용).
void wavBodyText;
void wrapPcmAsWav;
