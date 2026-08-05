import { MeetingReport } from '@/reports/domain/meeting-report';
import { ReportRepository } from '@/reports/domain/ports/report.repository';
import { externalReference, NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects/external-reference';
import { reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

import { ReportLookupService } from './report-lookup.service';

const startedAt = new Date('2026-01-01T00:00:00Z');
const endedAt = new Date('2026-01-01T00:30:00Z');

const summary = reportSummary({
  title: '요약이 뽑은 제목',
  overview: '개요',
  decisions: ['결정 1'],
  actionItems: [{ owner: '준', task: '문서 정리' }],
  keyTopics: [{ topic: '배포', points: ['금요일 배포'] }],
});

const makeReport = (overrides: { issueId?: string; title?: string | null } = {}) =>
  MeetingReport.fromEndedMeeting({
    id: 'rep_001',
    meetingId: 'mtg_001',
    code: 'abc12xyz',
    source: overrides.issueId === undefined ? 'web' : 'notion-issue',
    meetingType: 'general',
    externalReference:
      overrides.issueId === undefined
        ? NO_EXTERNAL_REFERENCE
        : externalReference({ issueId: overrides.issueId }),
    startedAt,
    endedAt,
    participants: [],
    chat: [],
    title: overrides.title ?? null,
  });

const finalize = (report: MeetingReport): MeetingReport => {
  report.applyTranscript([]);
  report.applySummary(summary);
  return report;
};

const makeAdapter = (report: MeetingReport | null) => {
  const repository: ReportRepository = {
    save: async () => {},
    findById: async (id) => (report !== null && report.id === id ? report : null),
    findByMeetingId: async () => null,
    listRecent: async () => [],
  };
  return new ReportLookupService(repository);
};

describe('ReportLookupService', () => {
  it('확정된 회의록을 외부 push용 읽기 뷰로 돌려준다', async () => {
    const adapter = makeAdapter(finalize(makeReport({ issueId: 'issue_1', title: '주간 회의' })));

    await expect(adapter.findFinalizedReport('rep_001')).resolves.toEqual({
      reportId: 'rep_001',
      meetingType: 'general',
      issueId: 'issue_1',
      title: '주간 회의',
      startedAt,
      endedAt,
      summary,
    });
  });

  it('없는 회의록이면 null을 돌려준다', async () => {
    const adapter = makeAdapter(null);

    await expect(adapter.findFinalizedReport('rep_001')).resolves.toBeNull();
  });

  it('파이프라인이 아직 확정되지 않았으면 null을 돌려준다', async () => {
    const adapter = makeAdapter(makeReport({ issueId: 'issue_1' }));

    await expect(adapter.findFinalizedReport('rep_001')).resolves.toBeNull();
  });

  it('외부 이슈에서 만들어지지 않은 회의는 issueId가 null이다', async () => {
    const adapter = makeAdapter(finalize(makeReport()));

    const view = await adapter.findFinalizedReport('rep_001');

    expect(view?.issueId).toBeNull();
  });

  it('회의 제목이 없으면 요약이 뽑은 제목을 쓴다', async () => {
    const adapter = makeAdapter(finalize(makeReport({ issueId: 'issue_1' })));

    const view = await adapter.findFinalizedReport('rep_001');

    expect(view?.title).toBe('요약이 뽑은 제목');
  });

  it('요약이 실패해 summary가 없어도 확정된 회의록이면 뷰를 돌려준다', async () => {
    const report = makeReport({ issueId: 'issue_1' });
    report.markTranscriptionFailed('stt down', endedAt);
    report.markSummaryFailed('skipped', endedAt);
    const adapter = makeAdapter(report);

    const view = await adapter.findFinalizedReport('rep_001');

    expect(view).toMatchObject({ reportId: 'rep_001', summary: null, title: null });
  });
});
