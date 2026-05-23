import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

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
        consume: consumeMock,
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

  it('participant 별 transcribe 결과의 segment 에 speaker=participantId 가 채워진다', async () => {
    const { service, transcribeMock, events } = makeService({
      audios: [{ participantId: 's1', audio: Buffer.from('A') }],
      transcribeImpl: async () => [
        { text: '안녕하세요', startMs: 0, endMs: 1000 },
        { text: '잘 부탁드립니다', startMs: 1000, endMs: 2500 },
      ],
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    expect(transcribeMock).toHaveBeenCalledWith({
      meetingCode,
      audio: Buffer.from('A'),
    });
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
    const transcribeMock = jest.fn(async ({ audio }: { audio: Buffer }) => {
      if (audio.toString() === 'A') {
        return [
          { text: 'a0', startMs: 0, endMs: 500 },
          { text: 'a2', startMs: 2000, endMs: 2500 },
        ];
      }
      if (audio.toString() === 'B') {
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
        consume: async () => [
          { participantId: 's1', audio: Buffer.from('A') },
          { participantId: 's2', audio: Buffer.from('B') },
        ],
      },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    await service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 });
    const payload = events[0].payload as {
      transcript: TranscriptionSegmentPayload[];
    };
    expect(payload.transcript).toEqual([
      { speaker: 's1', text: 'a0', startMs: 0, endMs: 500 },
      { speaker: 's2', text: 'b1', startMs: 1000, endMs: 1500 },
      { speaker: 's1', text: 'a2', startMs: 2000, endMs: 2500 },
      { speaker: 's2', text: 'b3', startMs: 3000, endMs: 3500 },
    ]);
  });

  it('participant 의 startedAtMs 가 회의 시작 시각보다 늦으면 segment offset 이 +(startedAtMs - meetingStartedAtMs) 만큼 가산된다', async () => {
    // 회의 시작: t=1000_000_000_000 ms
    // s1: 회의 시작과 동시에 capture → offset 0
    // s2: 회의 시작 30초 후 capture → segment 들이 +30000ms 만큼 밀려서 정렬돼야 한다.
    const meetingStartedAtMs = 1_000_000_000_000;
    const s2StartedAtMs = meetingStartedAtMs + 30_000;
    const transcribeMock = jest.fn(async ({ audio }: { audio: Buffer }) => {
      if (audio.toString() === 'A') {
        return [{ text: 'a0', startMs: 0, endMs: 500 }];
      }
      if (audio.toString() === 'B') {
        // B 입장 직후 발화 → audio 시간축으로는 0 ms 부터지만 회의 시간축에선 30000ms.
        return [{ text: 'b0', startMs: 0, endMs: 800 }];
      }
      return [];
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        consume: async () => [
          { participantId: 's1', audio: Buffer.from('A'), startedAtMs: meetingStartedAtMs },
          { participantId: 's2', audio: Buffer.from('B'), startedAtMs: s2StartedAtMs },
        ],
      },
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

  it('participant 의 startedAtMs 가 누락되면 보정 없이 0 offset 으로 취급한다(레거시 호환)', async () => {
    const meetingStartedAtMs = 1_000_000_000_000;
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        markStarted: async () => {},
        consume: async () => [
          { participantId: 's1', audio: Buffer.from('A') }, // startedAtMs 누락
        ],
      },
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
        consume: async () => [
          { participantId: 's1', audio: Buffer.from('A'), startedAtMs: beforeMeetingMs },
        ],
      },
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

  it('Transcriber 가 throw 하면 report.transcription.failed 를 error 메시지와 함께 발행한다', async () => {
    const { service, events } = makeService({
      audios: [{ participantId: 's1', audio: Buffer.from('x') }],
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
      audios: [{ participantId: 's1', audio: Buffer.from('x') }],
      transcribeImpl: async () => {
        throw new Error('boom');
      },
    });
    await expect(
      service.requestTranscription({ reportId, meetingCode, meetingStartedAtMs: 0 }),
    ).resolves.toBeUndefined();
  });
});
