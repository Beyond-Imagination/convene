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
      publish: (name: string, payload: unknown) => {
        events.push({ name, payload });
      },
    },
  };
};

describe('RecordingService.requestTranscription', () => {
  const reportId = 'rep-1';
  const meetingCode = 'abc12xyz';
  const sampleTranscript: TranscriptionSegmentPayload[] = [
    { text: '안녕하세요', startMs: 0, endMs: 1000 },
  ];

  const makeService = (opts: {
    audio?: Buffer | null;
    transcribeResult?: ReadonlyArray<TranscriptionSegmentPayload>;
    transcribeError?: Error;
  } = {}) => {
    const consumeMock = jest.fn(async () => opts.audio ?? null);
    const transcribeMock = jest.fn(async () => {
      if (opts.transcribeError) throw opts.transcribeError;
      return opts.transcribeResult ?? sampleTranscript;
    });
    const { events, publisher } = makeEventPublisher();
    const service = new RecordingService({
      audioBufferRepository: {
        append: async () => {},
        consume: consumeMock,
      },
      transcriber: { transcribe: transcribeMock },
      eventPublisher: publisher,
    });
    return { service, consumeMock, transcribeMock, events };
  };

  it('AudioBuffer.consume과 Transcriber.transcribe를 meetingCode로 호출한다', async () => {
    const audio = Buffer.from('opus-bytes');
    const { service, consumeMock, transcribeMock } = makeService({ audio });
    await service.requestTranscription({ reportId, meetingCode });
    expect(consumeMock).toHaveBeenCalledWith(meetingCode);
    expect(transcribeMock).toHaveBeenCalledWith({ meetingCode, audio });
  });

  it('성공 시 report.transcription.completed를 transcript와 함께 발행한다', async () => {
    const { service, events } = makeService({ audio: Buffer.from('x') });
    await service.requestTranscription({ reportId, meetingCode });
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_COMPLETED,
        payload: { reportId, transcript: sampleTranscript },
      },
    ]);
  });

  it('AudioBuffer가 비어 있어도(consume이 null) transcriber에 그대로 위임한다', async () => {
    const { service, transcribeMock, events } = makeService({
      audio: null,
      transcribeResult: [],
    });
    await service.requestTranscription({ reportId, meetingCode });
    expect(transcribeMock).toHaveBeenCalledWith({ meetingCode, audio: null });
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_COMPLETED,
        payload: { reportId, transcript: [] },
      },
    ]);
  });

  it('Transcriber가 throw하면 report.transcription.failed를 error 메시지와 함께 발행한다', async () => {
    const { service, events } = makeService({
      audio: Buffer.from('x'),
      transcribeError: new Error('ai-worker 503'),
    });
    await service.requestTranscription({ reportId, meetingCode });
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_FAILED,
        payload: { reportId, error: 'ai-worker 503' },
      },
    ]);
  });

  it('실패해도 throw 하지 않는다 (listener가 위에서 swallow하지 않아도 됨)', async () => {
    const { service } = makeService({
      audio: Buffer.from('x'),
      transcribeError: new Error('boom'),
    });
    await expect(service.requestTranscription({ reportId, meetingCode })).resolves.toBeUndefined();
  });
});
