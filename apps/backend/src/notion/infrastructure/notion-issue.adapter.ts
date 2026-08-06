import { NotionIssuePort, PendingIssue } from '@/notion/domain/ports/notion-issue.port';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import {
  MEETING_PENDING_STATUS,
  MEETING_TRIGGER_OPTION,
  NOTION_ISSUE_PROPERTIES,
} from '@/notion/infrastructure/notion-issue.properties';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

// 시각이 아닌 날짜로 비교한다. 노션 `날짜`는 시간이 선택 사항이라 시각으로 자르면 시간 없는 값(자정 취급)과 이미 시작한 당일 회의가 통째로 필터에서 빠진다.
function todayInUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** 폴링 필터: `유형⊃회의 AND 상태=시작 전 AND 링크 없음 AND (날짜 미설정 OR 날짜≥오늘)`. */
export function buildPendingIssuesFilter(now: Date): Record<string, unknown> {
  return {
    and: [
      { property: NOTION_ISSUE_PROPERTIES.type, multi_select: { contains: MEETING_TRIGGER_OPTION } },
      { property: NOTION_ISSUE_PROPERTIES.status, status: { equals: MEETING_PENDING_STATUS } },
      { property: NOTION_ISSUE_PROPERTIES.meetingLink, url: { is_empty: true } },
      {
        or: [
          { property: NOTION_ISSUE_PROPERTIES.meetingDate, date: { is_empty: true } },
          { property: NOTION_ISSUE_PROPERTIES.meetingDate, date: { on_or_after: todayInUtc(now) } },
        ],
      },
    ],
  };
}

// title 속성명이 DB마다 달라도(`이름`/`Name`) 이름이 아닌 타입으로 찾는다.
function extractTitle(properties: Record<string, unknown>): string | null {
  for (const value of Object.values(properties)) {
    const prop = value as { type?: unknown; title?: unknown };
    if (prop.type !== 'title' || !Array.isArray(prop.title)) continue;
    const text = prop.title
      .map((run) => (run as { plain_text?: unknown }).plain_text)
      .filter((t): t is string => typeof t === 'string')
      .join('');
    return text.length > 0 ? text : null;
  }
  return null;
}

export class NotionIssueAdapter implements NotionIssuePort {
  constructor(
    private readonly client: NotionHttpClient,
    private readonly databaseIds: ReadonlyArray<string>,
    private readonly logger: PinoLoggerAdapter,
    /** 이전 회의 카드를 식별하는 기준. 이 주소로 시작하는 embed만 우리 것으로 본다. */
    private readonly meetingLinkBase: string,
  ) {}

  async findPendingIssues(now: Date): Promise<PendingIssue[]> {
    const filter = buildPendingIssuesFilter(now);
    const issues: PendingIssue[] = [];
    for (const databaseId of this.databaseIds) {
      try {
        issues.push(...(await this.collectFromDatabase(databaseId, filter)));
      } catch (error) {
        // 한 DB(권한/삭제 등) 실패가 나머지 DB 폴링을 막지 않도록 격리한다.
        this.logger.error({ databaseId, err: error }, 'notion DB 폴링 실패');
      }
    }
    return issues;
  }

  async writeMeetingLink(issueId: string, url: string): Promise<void> {
    await this.client.updatePageProperties(issueId, {
      [NOTION_ISSUE_PROPERTIES.meetingLink]: { url },
    });
  }

  async embedMeetingCard(issueId: string, url: string): Promise<void> {
    await this.removeStaleMeetingCards(issueId);
    await this.client.appendBlockChildren(issueId, [{ type: 'embed', embed: { url } }], {
      type: 'start',
    });
  }

  private async collectFromDatabase(
    databaseId: string,
    filter: Record<string, unknown>,
  ): Promise<PendingIssue[]> {
    const issues: PendingIssue[] = [];
    for (const dataSourceId of await this.listDataSourceIds(databaseId)) {
      let cursor: string | undefined;
      do {
        const body = cursor === undefined ? { filter } : { filter, start_cursor: cursor };
        const pageResult = await this.client.queryDataSource(dataSourceId, body);
        for (const raw of pageResult.results) {
          const properties = (raw.properties ?? {}) as Record<string, unknown>;
          issues.push({ issueId: raw.id as string, title: extractTitle(properties) });
        }
        cursor = pageResult.has_more ? (pageResult.next_cursor ?? undefined) : undefined;
      } while (cursor !== undefined);
    }
    return issues;
  }

  // 카드는 항상 맨 앞에 심으므로 첫 페이지만 훑어도 이전 카드를 찾을 수 있다.
  private async removeStaleMeetingCards(issueId: string): Promise<void> {
    const { results } = await this.client.getBlockChildren(issueId);
    for (const block of results) {
      const embed = (block as { embed?: { url?: unknown } }).embed;
      if (block.type !== 'embed' || typeof embed?.url !== 'string') continue;
      if (!embed.url.startsWith(this.meetingLinkBase)) continue;
      await this.client.deleteBlock(block.id as string);
    }
  }

  // 2025-09-03부터 조회는 DB가 아닌 data source 단위. 단일 소스 DB면 항목 하나.
  private async listDataSourceIds(databaseId: string): Promise<string[]> {
    const database = await this.client.retrieveDatabase(databaseId);
    const dataSources = (database.data_sources ?? []) as ReadonlyArray<{ id?: unknown }>;
    return dataSources.map((ds) => ds.id).filter((id): id is string => typeof id === 'string');
  }
}
