import { NotionHttpClient, NotionListPage } from '@/notion/infrastructure/notion-http.client';
import {
  buildPendingIssuesFilter,
  NotionIssueAdapter,
} from '@/notion/infrastructure/notion-issue.adapter';

const NOW = new Date('2026-07-20T12:00:00.000Z');

function titleIssue(id: string, title: string): Record<string, unknown> {
  return { id, properties: { 이름: { type: 'title', title: [{ plain_text: title }] } } };
}

function page(
  results: ReadonlyArray<Record<string, unknown>>,
  nextCursor: string | null = null,
): NotionListPage {
  return { results, next_cursor: nextCursor, has_more: nextCursor !== null };
}

describe('buildPendingIssuesFilter', () => {
  it('유형⊃회의 AND 링크 없음 AND (날짜 미설정 OR 날짜≤now) 필터를 조립한다', () => {
    expect(buildPendingIssuesFilter(NOW)).toEqual({
      and: [
        { property: '유형', multi_select: { contains: '회의' } },
        { property: '회의링크', url: { is_empty: true } },
        {
          or: [
            { property: '날짜', date: { is_empty: true } },
            { property: '날짜', date: { on_or_before: '2026-07-20T12:00:00.000Z' } },
          ],
        },
      ],
    });
  });
});

describe('NotionIssueAdapter.findPendingIssues', () => {
  it('DB의 data source를 조회해 필터로 순회하고 페이지네이션을 따라 결과를 합친다', async () => {
    const calls: { dsId: string; body: { filter?: unknown; start_cursor?: string } }[] = [];
    const client = {
      retrieveDatabase: async (dbId: string): Promise<Record<string, unknown>> => ({
        data_sources: [{ id: `${dbId}-ds` }],
      }),
      queryDataSource: async (
        dsId: string,
        body: { start_cursor?: string },
      ): Promise<NotionListPage> => {
        calls.push({ dsId, body });
        if (dsId === 'team-db-ds' && body.start_cursor === undefined) {
          return page([titleIssue('A', 'A제목')], 'cursor-1');
        }
        if (dsId === 'team-db-ds' && body.start_cursor === 'cursor-1') {
          return page([titleIssue('B', 'B제목')]);
        }
        return page([titleIssue('C', 'C제목')]);
      },
    } as unknown as NotionHttpClient;

    const adapter = new NotionIssueAdapter(client, ['team-db', 'proj-db']);
    const result = await adapter.findPendingIssues(NOW);

    expect(result).toEqual([
      { issueId: 'A', title: 'A제목' },
      { issueId: 'B', title: 'B제목' },
      { issueId: 'C', title: 'C제목' },
    ]);
    expect(calls[0]).toEqual({ dsId: 'team-db-ds', body: { filter: buildPendingIssuesFilter(NOW) } });
    expect(calls[1].body.start_cursor).toBe('cursor-1');
    expect(calls[2].dsId).toBe('proj-db-ds');
  });

  it('한 DB에 data source가 여럿이면 모두 순회한다', async () => {
    const queried: string[] = [];
    const client = {
      retrieveDatabase: async (): Promise<Record<string, unknown>> => ({
        data_sources: [{ id: 'ds-1' }, { id: 'ds-2' }],
      }),
      queryDataSource: async (dsId: string): Promise<NotionListPage> => {
        queried.push(dsId);
        return page([titleIssue(dsId, dsId)]);
      },
    } as unknown as NotionHttpClient;

    await new NotionIssueAdapter(client, ['db']).findPendingIssues(NOW);

    expect(queried).toEqual(['ds-1', 'ds-2']);
  });

  it('title 타입 속성이 없으면 title은 null', async () => {
    const client = {
      retrieveDatabase: async (): Promise<Record<string, unknown>> => ({ data_sources: [{ id: 'ds' }] }),
      queryDataSource: async (): Promise<NotionListPage> => page([{ id: 'no-title', properties: {} }]),
    } as unknown as NotionHttpClient;

    const result = await new NotionIssueAdapter(client, ['db']).findPendingIssues(NOW);

    expect(result).toEqual([{ issueId: 'no-title', title: null }]);
  });
});

describe('NotionIssueAdapter.writeMeetingLink', () => {
  it('회의링크 url 속성을 patch 한다', async () => {
    const calls: { pageId: string; properties: unknown }[] = [];
    const client = {
      updatePageProperties: async (pageId: string, properties: Record<string, unknown>) => {
        calls.push({ pageId, properties });
        return {};
      },
    } as unknown as NotionHttpClient;

    await new NotionIssueAdapter(client, []).writeMeetingLink(
      'page-1',
      'https://convene.example.com/meetings/ABC123',
    );

    expect(calls[0]).toEqual({
      pageId: 'page-1',
      properties: { '회의링크': { url: 'https://convene.example.com/meetings/ABC123' } },
    });
  });
});
