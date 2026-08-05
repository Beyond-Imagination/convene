import { NotionReportPort } from '@/notion/domain/ports/notion-report.port';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { toReportBlocks } from '@/notion/infrastructure/report-blocks.mapper';
import { FinalizedReport } from '@/reports/application/report-lookup.service';

// 노션 append는 요청당 100 블록까지 받는다.
const MAX_BLOCKS_PER_REQUEST = 100;

function anchorText(block: Record<string, unknown>): string {
  const body = block.toggle as { rich_text?: ReadonlyArray<unknown> } | undefined;
  return (body?.rich_text ?? [])
    .map((run) => (run as { plain_text?: unknown }).plain_text)
    .filter((t): t is string => typeof t === 'string')
    .join('');
}

function isReportAnchor(block: Record<string, unknown>, reportId: string): boolean {
  return block.type === 'toggle' && anchorText(block).includes(reportId);
}

function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function firstAppendedId(response: Record<string, unknown>): string {
  const results = (response.results ?? []) as ReadonlyArray<{ id?: unknown }>;
  const id = results[0]?.id;
  if (typeof id !== 'string') {
    throw new Error('Notion append response did not contain a block id');
  }
  return id;
}

export class NotionReportAdapter implements NotionReportPort {
  constructor(private readonly client: NotionHttpClient) {}

  async pushReport(issueId: string, report: FinalizedReport): Promise<void> {
    const { wrapper, children } = toReportBlocks(report);
    // 재삽입: 같은 회의록의 기존 toggle을 먼저 지워 중복을 남기지 않는다.
    await this.removeExistingAnchor(issueId, report.reportId);

    const appended = await this.client.appendBlockChildren(issueId, [wrapper]);
    const wrapperId = firstAppendedId(appended);
    for (const part of chunk(children, MAX_BLOCKS_PER_REQUEST)) {
      await this.client.appendBlockChildren(wrapperId, part);
    }
  }

  private async removeExistingAnchor(issueId: string, reportId: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const result = await this.client.getBlockChildren(issueId, cursor);
      for (const raw of result.results) {
        if (isReportAnchor(raw, reportId)) {
          await this.client.deleteBlock(raw.id as string);
          return;
        }
      }
      cursor = result.has_more ? (result.next_cursor ?? undefined) : undefined;
    } while (cursor !== undefined);
  }
}
