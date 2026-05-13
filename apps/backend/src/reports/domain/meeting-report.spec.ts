import { chatEntry, externalReference } from '@/shared-kernel/domain/value-objects';

import { participantEntry, transcriptSegment } from './entries';
import { MeetingReport } from './meeting-report';
import { notionPushResult, reportSummary } from './value-objects';

describe('MeetingReport (Aggregate Root)', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');
  const failAt = new Date('2026-01-01T00:31:00Z');

  const baseInput = () => ({
    id: 'report-1',
    meetingId: 'meeting-1',
    code: 'abc12xyz',
    source: 'web' as const,
    externalReference: externalReference(),
    startedAt,
    endedAt,
    participants: [
      participantEntry({ id: 's1', nickname: 'alice', joinedAt: startedAt, leftAt: endedAt }),
    ],
    chat: [chatEntry({ nickname: 'alice', text: 'hi', sentAt: startedAt })],
  });

  const validSummary = () =>
    reportSummary({
      title: '주간 회의',
      overview: '요약',
      decisions: [],
      actionItems: [],
      keyTopics: [],
    });

  describe('fromEndedMeeting', () => {
    it('draft 상태로 생성된다(transcript 비어 있음, pipeline 모두 pending)', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      expect(r.id).toBe('report-1');
      expect(r.transcript).toEqual([]);
      expect(r.summary).toBeNull();
      expect(r.pipeline.sttStatus).toBe('pending');
      expect(r.pipeline.summaryStatus).toBe('pending');
      expect(r.pushedToNotion).toBeNull();
      expect(r.isFinalized).toBe(false);
    });

    it.each([
      ['id', { id: '' }],
      ['meetingId', { meetingId: '   ' }],
      ['code', { code: '' }],
    ])('%s가 trim 후 비어 있으면 거부한다', (_field, overrides) => {
      expect(() => MeetingReport.fromEndedMeeting({ ...baseInput(), ...overrides })).toThrow();
    });

    it('endedAt이 startedAt보다 이르면 거부한다', () => {
      expect(() =>
        MeetingReport.fromEndedMeeting({
          ...baseInput(),
          startedAt: endedAt,
          endedAt: startedAt,
        }),
      ).toThrow(/endedAt cannot be earlier/);
    });
  });

  describe('applyTranscript', () => {
    it('정상 적용 시 transcript 보존, pipeline stt=done', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      const seg = transcriptSegment({ text: 'hello', startMs: 0, endMs: 1000 });
      r.applyTranscript([seg]);
      expect(r.transcript).toEqual([seg]);
      expect(r.pipeline.sttStatus).toBe('done');
    });

    it('중복 적용은 거부하고 기존 transcript를 보존한다', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      const seg1 = transcriptSegment({ text: 'one', startMs: 0, endMs: 100 });
      const seg2 = transcriptSegment({ text: 'two', startMs: 100, endMs: 200 });
      r.applyTranscript([seg1]);
      expect(() => r.applyTranscript([seg2])).toThrow(/already/);
      expect(r.transcript).toEqual([seg1]);
    });

    it('markTranscriptionFailed 후에는 transcript 적용 거부', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.markTranscriptionFailed('boom', failAt);
      const seg = transcriptSegment({ text: 'hello', startMs: 0, endMs: 100 });
      expect(() => r.applyTranscript([seg])).toThrow(/already/);
    });
  });

  describe('markTranscriptionFailed', () => {
    it('실패 사유가 failures에 누적되고 pipeline.stt=failed', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.markTranscriptionFailed('boom', failAt);
      expect(r.pipeline.sttStatus).toBe('failed');
      expect(r.pipeline.failures).toEqual([{ stage: 'stt', error: 'boom', at: failAt }]);
    });
  });

  describe('applySummary', () => {
    it('정상 적용 시 summary 저장 + pipeline summary=done', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      const s = validSummary();
      r.applySummary(s);
      expect(r.summary).toBe(s);
      expect(r.pipeline.summaryStatus).toBe('done');
    });

    it('중복 적용은 거부', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.applySummary(validSummary());
      expect(() => r.applySummary(validSummary())).toThrow(/already/);
    });
  });

  describe('markSummaryFailed', () => {
    it('summary 실패도 failures에 누적되고 pipeline.summary=failed', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.markSummaryFailed('llm boom', failAt);
      expect(r.pipeline.summaryStatus).toBe('failed');
      expect(r.pipeline.failures).toEqual([{ stage: 'summary', error: 'llm boom', at: failAt }]);
    });
  });

  describe('attachNotionPushResult', () => {
    it('pipeline이 final 상태가 아니면 거부한다', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      expect(() => r.attachNotionPushResult(notionPushResult({ pageId: 'p1', at: failAt }))).toThrow(
        /pipeline is final/,
      );
    });

    it('두 stage 모두 done이면 영수증 부착 가능', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.applyTranscript([]);
      r.applySummary(validSummary());
      const receipt = notionPushResult({ pageId: 'p1', at: failAt });
      r.attachNotionPushResult(receipt);
      expect(r.pushedToNotion).toBe(receipt);
    });

    it('중복 부착은 거부', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.applyTranscript([]);
      r.applySummary(validSummary());
      r.attachNotionPushResult(notionPushResult({ pageId: 'p1', at: failAt }));
      expect(() =>
        r.attachNotionPushResult(notionPushResult({ pageId: 'p2', at: failAt })),
      ).toThrow(/already been attached/);
    });
  });

  describe('isFinalized', () => {
    it('두 stage 모두 non-pending이면 true', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.applyTranscript([]);
      r.markSummaryFailed('boom', failAt);
      expect(r.isFinalized).toBe(true);
    });

    it('한 stage라도 pending이면 false', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      r.applyTranscript([]);
      expect(r.isFinalized).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('plain object로 모든 필드를 노출한다', () => {
      const r = MeetingReport.fromEndedMeeting(baseInput());
      const snap = r.snapshot();
      expect(snap.id).toBe('report-1');
      expect(snap.meetingId).toBe('meeting-1');
      expect(snap.code).toBe('abc12xyz');
      expect(snap.source).toBe('web');
      expect(snap.participants).toHaveLength(1);
      expect(snap.chat).toHaveLength(1);
      expect(snap.transcript).toEqual([]);
      expect(snap.summary).toBeNull();
      expect(snap.pushedToNotion).toBeNull();
    });
  });
});
