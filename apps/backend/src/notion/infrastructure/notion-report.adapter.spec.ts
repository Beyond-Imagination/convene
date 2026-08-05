import { NotionHttpClient, NotionListPage } from '@/notion/infrastructure/notion-http.client';
import { NotionReportAdapter } from '@/notion/infrastructure/notion-report.adapter';
import { FinalizedReport } from '@/reports/application/report-lookup.service';
import { reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';
import { stub } from '@/shared-kernel/testing/stub';

const REPORT_ID = 'rep_001';
const ISSUE_ID = 'issue_1';

const report = (overrides: Partial<FinalizedReport> = {}): FinalizedReport => ({
  reportId: REPORT_ID,
  meetingType: 'general',
  issueId: ISSUE_ID,
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
  ...overrides,
});

function page(
  results: ReadonlyArray<Record<string, unknown>>,
  nextCursor: string | null = null,
): NotionListPage {
  return { results, next_cursor: nextCursor, has_more: nextCursor !== null };
}

function anchorBlock(id: string, reportId: string): Record<string, unknown> {
  return {
    id,
    type: 'toggle',
    toggle: { rich_text: [{ plain_text: 'Convene 회의록 · 주간 회의' }, { plain_text: ` ${reportId}` }] },
  };
}

interface ClientCalls {
  appended: { blockId: string; children: ReadonlyArray<unknown> }[];
  deleted: string[];
  childrenQueries: { blockId: string; cursor?: string }[];
}

function makeClient(pages: ReadonlyArray<NotionListPage> = [page([])]): {
  client: NotionHttpClient;
  calls: ClientCalls;
} {
  const calls: ClientCalls = { appended: [], deleted: [], childrenQueries: [] };
  let queried = 0;
  const client = stub<NotionHttpClient>({
    getBlockChildren: async (blockId: string, cursor?: string): Promise<NotionListPage> => {
      calls.childrenQueries.push(cursor === undefined ? { blockId } : { blockId, cursor });
      return pages[queried++] ?? page([]);
    },
    appendBlockChildren: async (
      blockId: string,
      children: ReadonlyArray<unknown>,
    ): Promise<Record<string, unknown>> => {
      calls.appended.push({ blockId, children });
      return { results: [{ id: 'wrapper-1' }] };
    },
    deleteBlock: async (blockId: string): Promise<Record<string, unknown>> => {
      calls.deleted.push(blockId);
      return {};
    },
  });
  return { client, calls };
}

describe('NotionReportAdapter.pushReport', () => {
  it('앵커가 없으면 toggle을 이슈에 붙이고 본문은 그 toggle 아래에 넣는다', async () => {
    const { client, calls } = makeClient();

    await new NotionReportAdapter(client).pushReport(ISSUE_ID, report());

    expect(calls.deleted).toEqual([]);
    expect(calls.appended[0].blockId).toBe(ISSUE_ID);
    expect((calls.appended[0].children[0] as { type: string }).type).toBe('toggle');
    expect(calls.appended[1].blockId).toBe('wrapper-1');
  });

  it('같은 회의록의 기존 toggle이 있으면 지우고 다시 쓴다', async () => {
    const { client, calls } = makeClient([page([anchorBlock('old-block', REPORT_ID)])]);

    await new NotionReportAdapter(client).pushReport(ISSUE_ID, report());

    expect(calls.deleted).toEqual(['old-block']);
    expect(calls.appended[0].blockId).toBe(ISSUE_ID);
  });

  it('다른 회의록의 toggle이나 일반 블록은 지우지 않는다', async () => {
    const { client, calls } = makeClient([
      page([
        anchorBlock('other-report', 'rep_999'),
        { id: 'plain', type: 'paragraph', paragraph: { rich_text: [{ plain_text: REPORT_ID }] } },
      ]),
    ]);

    await new NotionReportAdapter(client).pushReport(ISSUE_ID, report());

    expect(calls.deleted).toEqual([]);
  });

  it('앵커를 찾을 때 페이지네이션을 따라간다', async () => {
    const { client, calls } = makeClient([
      page([{ id: 'a', type: 'paragraph', paragraph: { rich_text: [] } }], 'cur-2'),
      page([anchorBlock('old-block', REPORT_ID)]),
    ]);

    await new NotionReportAdapter(client).pushReport(ISSUE_ID, report());

    expect(calls.childrenQueries).toEqual([{ blockId: ISSUE_ID }, { blockId: ISSUE_ID, cursor: 'cur-2' }]);
    expect(calls.deleted).toEqual(['old-block']);
  });

  it('본문 블록이 요청당 상한을 넘으면 나눠 보낸다', async () => {
    const { client, calls } = makeClient();

    await new NotionReportAdapter(client).pushReport(
      ISSUE_ID,
      report({
        // 요약 2 + (heading + 결정 50) + (heading + 액션 50) = 104 블록.
        summary: reportSummary({
          title: '요약 제목',
          overview: '개요',
          decisions: Array.from({ length: 50 }, (_, i) => `결정 ${i}`),
          actionItems: Array.from({ length: 50 }, (_, i) => ({ task: `할 일 ${i}` })),
          keyTopics: [],
        }),
      }),
    );

    const childAppends = calls.appended.slice(1);
    expect(childAppends.map((c) => c.children.length)).toEqual([100, 4]);
    expect(childAppends.every((c) => c.blockId === 'wrapper-1')).toBe(true);
  });

  it('toggle append 응답에 블록 id가 없으면 실패한다', async () => {
    const client = stub<NotionHttpClient>({
      getBlockChildren: async (): Promise<NotionListPage> => page([]),
      appendBlockChildren: async (): Promise<Record<string, unknown>> => ({ results: [] }),
      deleteBlock: async (): Promise<Record<string, unknown>> => ({}),
    });

    await expect(new NotionReportAdapter(client).pushReport(ISSUE_ID, report())).rejects.toThrow();
  });
});
