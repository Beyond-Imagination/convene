import { ReportTranscriptionRequestedPayload } from '@/shared-kernel/domain/events';

import { RecordingService, RequestTranscriptionCommand } from './recording.service';
import { RecordingReportLifecycleListener } from './recording-report-lifecycle.listener';

const makeListener = () => {
  const calls: RequestTranscriptionCommand[] = [];
  const service = {
    requestTranscription: jest.fn(async (cmd: RequestTranscriptionCommand) => {
      calls.push(cmd);
    }),
  };
  const listener = new RecordingReportLifecycleListener(service as unknown as RecordingService);
  return { listener, calls, service };
};

describe('RecordingReportLifecycleListener', () => {
  const payload: ReportTranscriptionRequestedPayload = {
    reportId: 'rep-1',
    meetingId: 'abc12xyz',
    code: 'abc12xyz',
    meetingStartedAtMs: Date.UTC(2026, 0, 1, 0, 0, 0),
    participantNames: { s1: '준', s2: '벤' },
  };

  it('report.transcription.requested → RecordingService.requestTranscription 한 번 위임', async () => {
    const { listener, service } = makeListener();
    await listener.onTranscriptionRequested(payload);
    expect(service.requestTranscription).toHaveBeenCalledTimes(1);
  });

  it('payload.code/meetingStartedAtMs/participantNames를 RecordingService 입력에 그대로 매핑한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onTranscriptionRequested(payload);
    expect(calls[0]).toEqual({
      reportId: 'rep-1',
      meetingCode: 'abc12xyz',
      meetingStartedAtMs: payload.meetingStartedAtMs,
      participantNames: { s1: '준', s2: '벤' },
    });
  });
});
