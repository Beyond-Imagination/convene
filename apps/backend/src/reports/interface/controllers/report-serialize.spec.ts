import { participantEntry, transcriptSegment } from '@/reports/domain/entries';
import { MeetingReport } from '@/reports/domain/meeting-report';
import { notionPushResult, reportSummary } from '@/reports/domain/value-objects';
import {
  chatEntry,
  externalReference,
  NO_EXTERNAL_REFERENCE,
} from '@/shared-kernel/domain/value-objects';

import { toReportDetailResponse, toReportListItem } from './report-serialize';

const startedAt = new Date('2026-01-01T00:00:00Z');
const tJoin = new Date('2026-01-01T00:01:00Z');
const endedAt = new Date('2026-01-01T00:30:00Z');

const makeDraft = () =>
  MeetingReport.fromEndedMeeting({
    id: 'r1',
    meetingId: 'mtg-1',
    code: 'abc12xyz',
    source: 'web',
    externalReference: NO_EXTERNAL_REFERENCE,
    startedAt,
    endedAt,
    participants: [
      participantEntry({ id: 'p1', nickname: '준', joinedAt: tJoin, leftAt: endedAt }),
      participantEntry({ id: 'p2', nickname: '아', joinedAt: tJoin, leftAt: null }),
    ],
    chat: [chatEntry({ nickname: '준', text: '안녕', sentAt: tJoin })],
  });

describe('toReportListItem', () => {
  it('도메인 Aggregate를 ReportListItem wire format으로 평면화한다', () => {
    const report = makeDraft();
    const item = toReportListItem(report);
    expect(item).toEqual({
      id: 'r1',
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:30:00.000Z',
      participantCount: 2,
      pipeline: { sttStatus: 'pending', summaryStatus: 'pending' },
      title: null,
    });
  });

  it('요약이 적용되면 ReportListItem.title은 summary.title을 노출한다', () => {
    const report = makeDraft();
    report.applyTranscript([transcriptSegment({ text: '안녕', startMs: 0, endMs: 1000 })]);
    report.applySummary(
      reportSummary({
        title: '회의 요약',
        overview: '핵심',
        decisions: [],
        actionItems: [],
        keyTopics: [],
      }),
    );
    expect(toReportListItem(report).title).toBe('회의 요약');
    expect(toReportListItem(report).pipeline).toEqual({
      sttStatus: 'done',
      summaryStatus: 'done',
    });
  });
});

describe('toReportDetailResponse', () => {
  it('draft 상태(transcript/summary 미적용)에서 ReportDetailResponse를 만든다', () => {
    const report = makeDraft();
    const detail = toReportDetailResponse(report);
    expect(detail.id).toBe('r1');
    expect(detail.meetingId).toBe('mtg-1');
    expect(detail.code).toBe('abc12xyz');
    expect(detail.externalReference).toEqual({});
    expect(detail.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(detail.endedAt).toBe('2026-01-01T00:30:00.000Z');
    expect(detail.participants).toEqual([
      {
        id: 'p1',
        nickname: '준',
        joinedAt: '2026-01-01T00:01:00.000Z',
        leftAt: '2026-01-01T00:30:00.000Z',
      },
      { id: 'p2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z', leftAt: null },
    ]);
    expect(detail.chat).toEqual([
      { nickname: '준', text: '안녕', sentAt: '2026-01-01T00:01:00.000Z' },
    ]);
    expect(detail.transcript).toEqual([]);
    expect(detail.summary).toBeNull();
    expect(detail.pipeline).toEqual({
      sttStatus: 'pending',
      summaryStatus: 'pending',
      failures: [],
    });
    expect(detail.pushedToNotion).toBeNull();
  });

  it('externalReference.issueId가 있으면 그대로 직렬화한다', () => {
    const report = MeetingReport.fromEndedMeeting({
      id: 'r2',
      meetingId: 'mtg-2',
      code: 'xyz99aaa',
      source: 'notion-issue',
      externalReference: externalReference({ issueId: 'NTN-7' }),
      startedAt,
      endedAt,
      participants: [],
      chat: [],
    });
    const detail = toReportDetailResponse(report);
    expect(detail.source).toBe('notion-issue');
    expect(detail.externalReference).toEqual({ issueId: 'NTN-7' });
  });

  it('파이프라인이 finalize되면 summary/transcript/failures를 wire format으로 직렬화한다', () => {
    const report = makeDraft();
    report.applyTranscript([
      transcriptSegment({ speaker: '준', text: '안녕', startMs: 0, endMs: 1500 }),
    ]);
    report.applySummary(
      reportSummary({
        title: '회의 요약',
        overview: '한 줄',
        decisions: ['결정 1'],
        actionItems: [{ task: '문서', owner: '준' }],
        keyTopics: [{ topic: 'DDD', points: ['Aggregate'] }],
      }),
    );
    const detail = toReportDetailResponse(report);
    expect(detail.transcript).toEqual([{ speaker: '준', text: '안녕', startMs: 0, endMs: 1500 }]);
    expect(detail.summary).toEqual({
      title: '회의 요약',
      overview: '한 줄',
      decisions: ['결정 1'],
      actionItems: [{ owner: '준', task: '문서' }],
      keyTopics: [{ topic: 'DDD', points: ['Aggregate'] }],
    });
    expect(detail.pipeline).toEqual({
      sttStatus: 'done',
      summaryStatus: 'done',
      failures: [],
    });
  });

  it('NotionPushResult가 부착되면 pushedToNotion이 wire format으로 노출된다', () => {
    const report = makeDraft();
    report.markTranscriptionFailed('skip', endedAt);
    report.markSummaryFailed('skip', endedAt);
    const pushedAt = new Date('2026-01-01T00:35:00Z');
    report.attachNotionPushResult(notionPushResult({ pageId: 'PG-1', at: pushedAt }));
    const detail = toReportDetailResponse(report);
    expect(detail.pushedToNotion).toEqual({
      pageId: 'PG-1',
      at: '2026-01-01T00:35:00.000Z',
    });
    expect(detail.pipeline.failures).toHaveLength(2);
    expect(detail.pipeline.failures[0]).toEqual({
      stage: 'stt',
      error: 'skip',
      at: '2026-01-01T00:30:00.000Z',
    });
  });
});
