import { ReportNotionPushedPayload, ReportTranscriptionCompletedPayload, ReportTranscriptionFailedPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { stub } from '@/shared-kernel/testing/stub';

import {
  CompleteTranscriptionCommand,
  FailTranscriptionCommand,
  RecordNotionPushCommand,
  ReportFinalizationService,
} from './report-finalization.service';
import { ReportPipelineListener } from './report-pipeline.listener';

const makeListener = () => {
  const completed: CompleteTranscriptionCommand[] = [];
  const failed: FailTranscriptionCommand[] = [];
  const notionPushes: RecordNotionPushCommand[] = [];
  const service = {
    completeTranscription: jest.fn(async (cmd: CompleteTranscriptionCommand) => {
      completed.push(cmd);
    }),
    failTranscription: jest.fn(async (cmd: FailTranscriptionCommand) => {
      failed.push(cmd);
    }),
    recordNotionPush: jest.fn(async (cmd: RecordNotionPushCommand) => {
      notionPushes.push(cmd);
    }),
  };
  const listener = new ReportPipelineListener(stub<ReportFinalizationService>(service));
  return { listener, completed, failed, notionPushes, service };
};

describe('ReportPipelineListener.onTranscriptionCompleted', () => {
  it('payload.transcript을 그대로 TranscriptSegment 배열로 위임한다', async () => {
    const { listener, completed } = makeListener();
    const payload: ReportTranscriptionCompletedPayload = {
      reportId: 'r1',
      transcript: [
        { text: '안녕', startMs: 0, endMs: 100 },
        { speaker: '준', text: '두 번째', startMs: 200, endMs: 500 },
      ],
    };
    await listener.onTranscriptionCompleted(payload);
    expect(completed).toHaveLength(1);
    expect(completed[0].reportId).toBe('r1');
    expect(completed[0].transcript).toEqual([
      { text: '안녕', startMs: 0, endMs: 100 },
      { speaker: '준', text: '두 번째', startMs: 200, endMs: 500 },
    ]);
  });

  it('빈 transcript도 그대로 위임한다 (Recording이 빈 결과 보고한 경우)', async () => {
    const { listener, service } = makeListener();
    await listener.onTranscriptionCompleted({ reportId: 'r2', transcript: [] });
    expect(service.completeTranscription).toHaveBeenCalledWith({
      reportId: 'r2',
      transcript: [],
    });
  });
});

describe('ReportPipelineListener.onTranscriptionFailed', () => {
  it('payload.reportId와 error를 그대로 failTranscription에 위임한다', async () => {
    const { listener, failed } = makeListener();
    const payload: ReportTranscriptionFailedPayload = {
      reportId: 'r1',
      error: 'ai-worker 503',
    };
    await listener.onTranscriptionFailed(payload);
    expect(failed).toEqual([{ reportId: 'r1', error: 'ai-worker 503' }]);
  });
});

describe('ReportPipelineListener.onNotionPushed', () => {
  it('payload의 push 영수증을 그대로 recordNotionPush에 위임한다', async () => {
    const { listener, notionPushes } = makeListener();
    const payload: ReportNotionPushedPayload = {
      reportId: 'r1',
      pageId: 'issue_1',
      at: new Date('2026-01-01T01:00:00Z'),
    };
    await listener.onNotionPushed(payload);
    expect(notionPushes).toEqual([payload]);
  });
});
