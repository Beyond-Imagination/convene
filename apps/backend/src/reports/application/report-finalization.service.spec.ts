import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { participantEntry } from '@/reports/domain/entries';
import {
  chatEntry,
  externalReference,
  NO_EXTERNAL_REFERENCE,
} from '@/shared-kernel/domain/value-objects';

import { MeetingReport } from '../domain/meeting-report';
import { ReportFinalizationService } from './report-finalization.service';

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
