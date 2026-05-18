import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { participantEntry, transcriptSegment } from '@/reports/domain/entries';
import { ReportSummary, reportSummary } from '@/reports/domain/value-objects';
import {
  chatEntry,
  externalReference,
  NO_EXTERNAL_REFERENCE,
} from '@/shared-kernel/domain/value-objects';

import { MeetingReport } from '../domain/meeting-report';
import { ReportFinalizationService } from './report-finalization.service';
import { ReportNotFoundError } from './report.errors';

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

const noopSummarizer = () => ({
  summarize: jest.fn(),
});

const noopNotion = () => ({
  push: jest.fn(),
});

describe('ReportFinalizationService.createDraft', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');
  const generatedId = 'rep_0001';

  const makeService = () => {
    const saved: MeetingReport[] = [];
    const { events, publisher } = makeEventPublisher();
    const summarizer = noopSummarizer();
    const notion = noopNotion();
    const service = new ReportFinalizationService({
      repository: {
        save: async (r) => {
          saved.push(r);
        },
        findById: async () => null,
        findByMeetingId: async () => null,
        listRecent: async () => [],
      },
      summarizer,
      notion,
      idGenerator: { next: () => generatedId },
      clock: { now: () => endedAt },
      eventPublisher: publisher,
    });
    return { service, saved, events, summarizer, notion };
  };

  const validCommand = () => ({
    meetingId: 'mtg_001',
    code: 'abc12xyz',
    source: 'web' as const,
    externalReference: NO_EXTERNAL_REFERENCE,
    startedAt,
    endedAt,
    participants: [
      participantEntry({
        id: 'p1',
        nickname: '준',
        joinedAt: startedAt,
        leftAt: endedAt,
      }),
    ],
    chat: [chatEntry({ nickname: '준', text: '안녕', sentAt: startedAt })],
  });

  it('ReportIdGenerator로 받은 id로 MeetingReport draft를 생성한다', async () => {
    const { service } = makeService();
    const report = await service.createDraft(validCommand());
    expect(report.id).toBe(generatedId);
    expect(report.meetingId).toBe('mtg_001');
    expect(report.code).toBe('abc12xyz');
  });

  it('Repository.save에 생성된 MeetingReport 인스턴스를 그대로 전달한다', async () => {
    const { service, saved } = makeService();
    const report = await service.createDraft(validCommand());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(report);
  });

  it('draft 시점의 pipeline은 두 stage 모두 pending이다', async () => {
    const { service } = makeService();
    const report = await service.createDraft(validCommand());
    expect(report.pipeline.sttStatus).toBe('pending');
    expect(report.pipeline.summaryStatus).toBe('pending');
    expect(report.transcript).toEqual([]);
    expect(report.summary).toBeNull();
  });

  it('participants와 chat 입력을 그대로 Aggregate에 이관한다', async () => {
    const { service } = makeService();
    const cmd = validCommand();
    const report = await service.createDraft(cmd);
    expect(report.participants).toEqual(cmd.participants);
    expect(report.chat).toEqual(cmd.chat);
  });

  it('externalReference와 source는 v2 확장 지점이므로 입력 그대로 보존한다', async () => {
    const { service } = makeService();
    const cmd = {
      ...validCommand(),
      source: 'notion-issue' as const,
      externalReference: externalReference({ issueId: 'NTN-7' }),
    };
    const report = await service.createDraft(cmd);
    expect(report.source).toBe('notion-issue');
    expect(report.externalReference).toEqual({ issueId: 'NTN-7' });
  });

  it('draft 저장 후 report.transcription.requested 이벤트를 발행한다', async () => {
    const { service, events } = makeService();
    await service.createDraft(validCommand());
    expect(events).toEqual([
      {
        name: REPORT_EVENTS.TRANSCRIPTION_REQUESTED,
        payload: { reportId: generatedId, meetingId: 'mtg_001', code: 'abc12xyz' },
      },
    ]);
  });

  it('Summarizer/Notion 포트는 draft 단계에서 호출하지 않는다', async () => {
    const { service, summarizer, notion } = makeService();
    await service.createDraft(validCommand());
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(notion.push).not.toHaveBeenCalled();
  });
});

describe('ReportFinalizationService.completeTranscription', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');
  const failedAt = new Date('2026-01-01T00:31:00Z');
  const reportId = 'rep_done';
  const chat = [chatEntry({ nickname: '준', text: '회의 시작', sentAt: startedAt })];
  const transcript = [transcriptSegment({ text: '안녕하세요', startMs: 0, endMs: 1000 })];
  const summaryResult: ReportSummary = reportSummary({
    title: '회의 요약',
    overview: '핵심만 요약',
    decisions: ['결정 1'],
    actionItems: [{ task: '문서 작성', owner: '준' }],
    keyTopics: [{ topic: '백엔드 설계', points: ['DDD', 'CQRS'] }],
  });

  const makeDraft = () =>
    MeetingReport.fromEndedMeeting({
      id: reportId,
      meetingId: 'mtg_x',
      code: 'code-x',
      source: 'web',
      externalReference: NO_EXTERNAL_REFERENCE,
      startedAt,
      endedAt,
      participants: [],
      chat,
    });

  const makeService = (
    opts: { summarizerResult?: ReportSummary; summarizerError?: Error } = {},
  ) => {
    const store = new Map<string, MeetingReport>();
    const draft = makeDraft();
    store.set(reportId, draft);
    const saves: string[] = [];
    const { events, publisher } = makeEventPublisher();

    const summarizer = {
      summarize: jest.fn(async () => {
        if (opts.summarizerError) throw opts.summarizerError;
        return opts.summarizerResult ?? summaryResult;
      }),
    };
    const notion = noopNotion();
    const service = new ReportFinalizationService({
      repository: {
        save: async (r) => {
          store.set(r.id, r);
          saves.push(r.id);
        },
        findById: async (id) => store.get(id) ?? null,
        findByMeetingId: async () => null,
        listRecent: async () => [],
      },
      summarizer,
      notion,
      idGenerator: { next: () => 'unused' },
      clock: { now: () => failedAt },
      eventPublisher: publisher,
    });
    return { service, store, saves, events, summarizer, notion };
  };

  it('존재하지 않는 reportId면 ReportNotFoundError를 던진다', async () => {
    const { service } = makeService();
    await expect(
      service.completeTranscription({ reportId: 'unknown', transcript }),
    ).rejects.toThrow(ReportNotFoundError);
  });

  it('transcript가 Aggregate에 반영되고 sttStatus가 done으로 전이된다', async () => {
    const { service, store } = makeService();
    await service.completeTranscription({ reportId, transcript });
    const after = store.get(reportId)!;
    expect(after.transcript).toEqual(transcript);
    expect(after.pipeline.sttStatus).toBe('done');
  });

  it('Summarizer.summarize에 transcript+chat+meta를 그대로 전달한다', async () => {
    const { service, summarizer } = makeService();
    await service.completeTranscription({ reportId, transcript });
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    expect(summarizer.summarize).toHaveBeenCalledWith({
      transcript,
      chat,
      meta: {
        meetingId: 'mtg_x',
        code: 'code-x',
        startedAt,
        endedAt,
      },
    });
  });

  it('성공 시 summary가 Aggregate에 적용되고 summaryStatus가 done이 된다', async () => {
    const { service, store } = makeService();
    await service.completeTranscription({ reportId, transcript });
    const after = store.get(reportId)!;
    expect(after.summary).toEqual(summaryResult);
    expect(after.pipeline.summaryStatus).toBe('done');
  });

  it('성공 시 report.summary.completed → report.finalized 순으로 발행한다', async () => {
    const { service, events } = makeService();
    await service.completeTranscription({ reportId, transcript });
    expect(events.map((e) => e.name)).toEqual([
      REPORT_EVENTS.SUMMARY_COMPLETED,
      REPORT_EVENTS.FINALIZED,
    ]);
    expect(events[0].payload).toEqual({ reportId });
    expect(events[1].payload).toEqual({ reportId });
  });

  it('Summarizer가 throw하면 markSummaryFailed로 전이하고 report.finalized만 발행한다', async () => {
    const { service, store, events } = makeService({
      summarizerError: new Error('LLM 502'),
    });
    await service.completeTranscription({ reportId, transcript });
    const after = store.get(reportId)!;
    expect(after.pipeline.sttStatus).toBe('done');
    expect(after.pipeline.summaryStatus).toBe('failed');
    expect(after.pipeline.failures).toEqual([
      { stage: 'summary', error: 'LLM 502', at: failedAt },
    ]);
    expect(events.map((e) => e.name)).toEqual([REPORT_EVENTS.FINALIZED]);
  });
});

describe('ReportFinalizationService.listRecent', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');

  const makeReport = (id: string, mid: string, durationMs: number) =>
    MeetingReport.fromEndedMeeting({
      id,
      meetingId: mid,
      code: `code-${mid}`,
      source: 'web',
      externalReference: NO_EXTERNAL_REFERENCE,
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationMs),
      participants: [],
      chat: [],
    });

  const makeService = () => {
    const repoListMock = jest.fn<Promise<MeetingReport[]>, [number]>(async () => []);
    const { publisher } = makeEventPublisher();
    const service = new ReportFinalizationService({
      repository: {
        save: async () => {},
        findById: async () => null,
        findByMeetingId: async () => null,
        listRecent: repoListMock,
      },
      summarizer: noopSummarizer(),
      notion: noopNotion(),
      idGenerator: { next: () => 'unused' },
      clock: { now: () => startedAt },
      eventPublisher: publisher,
    });
    return { service, repoListMock };
  };

  it('Repository.listRecent에 인자로 받은 limit을 그대로 위임한다', async () => {
    const { service, repoListMock } = makeService();
    repoListMock.mockResolvedValueOnce([]);
    await service.listRecent(7);
    expect(repoListMock).toHaveBeenCalledWith(7);
  });

  it('Repository가 돌려준 MeetingReport 배열을 그대로 반환한다', async () => {
    const { service, repoListMock } = makeService();
    const a = makeReport('r1', 'mtg-1', 10 * 60_000);
    const b = makeReport('r2', 'mtg-2', 20 * 60_000);
    repoListMock.mockResolvedValueOnce([b, a]);
    const result = await service.listRecent(5);
    expect(result).toEqual([b, a]);
  });
});

describe('ReportFinalizationService.getById', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');

  const makeReport = (id: string) =>
    MeetingReport.fromEndedMeeting({
      id,
      meetingId: `mtg-${id}`,
      code: `code-${id}`,
      source: 'web',
      externalReference: NO_EXTERNAL_REFERENCE,
      startedAt,
      endedAt,
      participants: [],
      chat: [],
    });

  const makeService = (stored: MeetingReport | null) => {
    const { publisher } = makeEventPublisher();
    const service = new ReportFinalizationService({
      repository: {
        save: async () => {},
        findById: async (id) => (stored && stored.id === id ? stored : null),
        findByMeetingId: async () => null,
        listRecent: async () => [],
      },
      summarizer: noopSummarizer(),
      notion: noopNotion(),
      idGenerator: { next: () => 'unused' },
      clock: { now: () => endedAt },
      eventPublisher: publisher,
    });
    return { service };
  };

  it('존재하는 id면 해당 MeetingReport를 돌려준다', async () => {
    const stored = makeReport('r1');
    const { service } = makeService(stored);
    expect(await service.getById('r1')).toBe(stored);
  });

  it('존재하지 않는 id면 ReportNotFoundError를 던진다', async () => {
    const { service } = makeService(null);
    await expect(service.getById('missing')).rejects.toThrow(ReportNotFoundError);
  });
});

describe('ReportFinalizationService.failTranscription', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');
  const failedAt = new Date('2026-01-01T00:31:00Z');
  const reportId = 'rep_stt_fail';

  const makeDraft = () =>
    MeetingReport.fromEndedMeeting({
      id: reportId,
      meetingId: 'mtg_x',
      code: 'code-x',
      source: 'web',
      externalReference: NO_EXTERNAL_REFERENCE,
      startedAt,
      endedAt,
      participants: [],
      chat: [],
    });

  const makeService = () => {
    const store = new Map<string, MeetingReport>();
    store.set(reportId, makeDraft());
    const { events, publisher } = makeEventPublisher();
    const summarizer = noopSummarizer();
    const notion = noopNotion();
    const service = new ReportFinalizationService({
      repository: {
        save: async (r) => {
          store.set(r.id, r);
        },
        findById: async (id) => store.get(id) ?? null,
        findByMeetingId: async () => null,
        listRecent: async () => [],
      },
      summarizer,
      notion,
      idGenerator: { next: () => 'unused' },
      clock: { now: () => failedAt },
      eventPublisher: publisher,
    });
    return { service, store, events, summarizer, notion };
  };

  it('존재하지 않는 reportId면 ReportNotFoundError를 던진다', async () => {
    const { service } = makeService();
    await expect(
      service.failTranscription({ reportId: 'unknown', error: 'ai-worker timeout' }),
    ).rejects.toThrow(ReportNotFoundError);
  });

  it('STT 실패 시 sttStatus는 failed, summary는 cascade로 skip 처리되어 failed가 된다', async () => {
    const { service, store } = makeService();
    await service.failTranscription({ reportId, error: 'ai-worker 5xx' });
    const after = store.get(reportId)!;
    expect(after.pipeline.sttStatus).toBe('failed');
    expect(after.pipeline.summaryStatus).toBe('failed');
    expect(after.pipeline.failures).toHaveLength(2);
    expect(after.pipeline.failures[0]).toMatchObject({ stage: 'stt', error: 'ai-worker 5xx' });
    expect(after.pipeline.failures[1]).toMatchObject({ stage: 'summary' });
  });

  it('Summarizer 포트는 호출되지 않는다', async () => {
    const { service, summarizer } = makeService();
    await service.failTranscription({ reportId, error: 'ai-worker 5xx' });
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('isFinalized 상태가 되면 report.finalized 이벤트를 발행한다', async () => {
    const { service, events } = makeService();
    await service.failTranscription({ reportId, error: 'ai-worker 5xx' });
    expect(events.map((e) => e.name)).toEqual([REPORT_EVENTS.FINALIZED]);
    expect(events[0].payload).toEqual({ reportId });
  });
});
