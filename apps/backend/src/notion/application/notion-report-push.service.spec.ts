import { DomainEventName, REPORT_EVENTS } from '@convene/shared-interfaces';

import { NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { FinalizedReport, ReportLookupService } from '@/reports/application/report-lookup.service';
import { reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

import { NotionReportPushService } from './notion-report-push.service';

const pushedAt = new Date('2026-01-01T01:00:00Z');

const finalizedReport = (issueId: string | null): FinalizedReport => ({
  reportId: 'rep_001',
  meetingType: 'general',
  issueId,
  title: '주간 회의',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: new Date('2026-01-01T00:30:00Z'),
  summary: reportSummary({
    title: '요약 제목',
    overview: '개요',
    decisions: [],
    actionItems: [],
    keyTopics: [],
  }),
});

function silentLogger(): PinoLoggerAdapter {
  return stub<PinoLoggerAdapter>({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });
}

const makeService = (options: {
  found?: FinalizedReport | null;
  lookupError?: Error;
  pushError?: Error;
}) => {
  const pushed: { issueId: string; report: FinalizedReport }[] = [];
  const reportLookup = stub<ReportLookupService>({
    findFinalizedReport: jest.fn(async () => {
      if (options.lookupError !== undefined) throw options.lookupError;
      return options.found ?? null;
    }),
  });
  const notionReport: NotionReportPort = {
    pushReport: jest.fn(async (issueId: string, report: FinalizedReport) => {
      if (options.pushError !== undefined) throw options.pushError;
      pushed.push({ issueId, report });
    }),
  };
  const events: { name: DomainEventName; payload: unknown }[] = [];
  const eventPublisher = stub<NestEventBusDomainEventPublisher>({
    publish: jest.fn(async (name: DomainEventName, payload: unknown) => {
      events.push({ name, payload });
    }),
  });
  const service = new NotionReportPushService(
      reportLookup,
      notionReport,
      { now: () => pushedAt },
      eventPublisher,
      silentLogger(),
    );
  return { service, pushed, events, reportLookup, notionReport };
};

describe('NotionReportPushService.pushFinalizedReport', () => {
  it('확정된 회의록을 만들어낸 이슈 페이지에 삽입한다', async () => {
    const report = finalizedReport('issue_1');
    const { service, pushed } = makeService({ found: report });

    await service.pushFinalizedReport('rep_001');

    expect(pushed).toEqual([{ issueId: 'issue_1', report }]);
  });

  it('회의록을 찾지 못하면 노션을 건드리지 않는다', async () => {
    const { service, notionReport } = makeService({ found: null });

    await service.pushFinalizedReport('rep_001');

    expect(notionReport.pushReport).not.toHaveBeenCalled();
  });

  it('이슈에서 만들어지지 않은 회의(web)는 건너뛴다', async () => {
    const { service, notionReport } = makeService({ found: finalizedReport(null) });

    await service.pushFinalizedReport('rep_001');

    expect(notionReport.pushReport).not.toHaveBeenCalled();
  });

  it('노션 삽입이 실패해도 예외를 전파하지 않는다', async () => {
    const { service } = makeService({
      found: finalizedReport('issue_1'),
      pushError: new Error('notion 500'),
    });

    await expect(service.pushFinalizedReport('rep_001')).resolves.toBeUndefined();
  });

  it('회의록 조회가 실패해도 예외를 전파하지 않는다', async () => {
    const { service, notionReport } = makeService({ lookupError: new Error('mongo down') });

    await expect(service.pushFinalizedReport('rep_001')).resolves.toBeUndefined();
    expect(notionReport.pushReport).not.toHaveBeenCalled();
  });

  it('삽입에 성공하면 push 영수증을 report.notion.pushed로 돌려보낸다', async () => {
    const { service, events } = makeService({ found: finalizedReport('issue_1') });

    await service.pushFinalizedReport('rep_001');

    expect(events).toEqual([
      {
        name: REPORT_EVENTS.NOTION_PUSHED,
        payload: { reportId: 'rep_001', pageId: 'issue_1', at: pushedAt },
      },
    ]);
  });

  it('삽입이 실패하면 영수증을 돌려보내지 않는다', async () => {
    const { service, events } = makeService({
      found: finalizedReport('issue_1'),
      pushError: new Error('notion 500'),
    });

    await service.pushFinalizedReport('rep_001');

    expect(events).toEqual([]);
  });
});
