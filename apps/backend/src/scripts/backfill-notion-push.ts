import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createConnection } from 'mongoose';

import { resolveMongoDbName, resolveMongoUri } from '@/config/mongo.config';
import { resolveNotionConfig } from '@/config/notion.config';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { isReportAnchor } from '@/notion/infrastructure/notion-report.adapter';
import { notionPushResult } from '@/reports/domain/value-objects/notion-push-result';
import { MEETING_REPORT_COLLECTION } from '@/reports/infrastructure/meeting-report.schema';
import { MongoReportRepository } from '@/reports/infrastructure/mongo-report.repository';

/**
 * 노션 동기화 표식(pushedToNotion) 백필. push 결과를 남기기 전에 만들어진 회의록이 대상이다.
 * 이슈 페이지에서 회의록 앵커 toggle을 찾아 그 블록의 created_time을 push 시각으로 쓴다.
 *
 * node dist/scripts/backfill-notion-push.js [--apply]   (--apply 없으면 dry-run)
 */

// 로컬 실행용. 운영은 env가 주입되므로 파일이 없으면 건너뛴다.
function loadDotEnv(): void {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const matched = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (matched !== null && process.env[matched[1]] === undefined) {
      process.env[matched[1]] = matched[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function findAnchorPushedAt(
  client: NotionHttpClient,
  issueId: string,
  reportId: string,
): Promise<Date | null> {
  let cursor: string | undefined;
  do {
    const page = await client.getBlockChildren(issueId, cursor);
    for (const block of page.results) {
      if (!isReportAnchor(block, reportId)) continue;
      const createdTime = block.created_time;
      return typeof createdTime === 'string' ? new Date(createdTime) : null;
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor !== undefined);
  return null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  loadDotEnv();

  const notionConfig = resolveNotionConfig();
  if (notionConfig === null) throw new Error('NOTION_TOKEN이 없어 노션을 조회할 수 없습니다');

  const connection = createConnection(resolveMongoUri(), {
    dbName: resolveMongoDbName(),
    serverSelectionTimeoutMS: 8000,
  });
  await connection.asPromise();

  const client = new NotionHttpClient(notionConfig);
  const repository = new MongoReportRepository(connection);
  // `pushedToNotion: null`은 필드가 없는 도큐먼트도 함께 잡는다.
  const candidates = await connection
    .collection(MEETING_REPORT_COLLECTION)
    .find({ pushedToNotion: null, 'externalReference.issueId': { $exists: true } })
    .project({ _id: 1, externalReference: 1 })
    .toArray();

  console.log(`[backfill] db=${resolveMongoDbName()} 후보=${candidates.length}건 apply=${apply}`);
  let marked = 0;
  for (const doc of candidates) {
    const reportId = String(doc._id);
    const issueId = String((doc.externalReference as { issueId?: string }).issueId);
    const pushedAt = await findAnchorPushedAt(client, issueId, reportId);
    if (pushedAt === null) {
      console.log(`[backfill] ${reportId}: 앵커 없음 — 노션에 삽입된 적 없음`);
      continue;
    }
    if (!apply) {
      console.log(`[backfill] ${reportId}: 앵커 ${pushedAt.toISOString()} (dry-run)`);
      continue;
    }
    const report = await repository.findById(reportId);
    if (report === null || !report.isFinalized) {
      console.log(`[backfill] ${reportId}: 확정 전 상태 — 건너뜀`);
      continue;
    }
    report.attachNotionPushResult(notionPushResult({ pageId: issueId, at: pushedAt }));
    await repository.save(report);
    marked += 1;
    console.log(`[backfill] ${reportId}: 표식 기록 ${pushedAt.toISOString()}`);
  }

  console.log(`[backfill] 완료 — 기록 ${marked}건`);
  await connection.close();
}

main().catch((error: unknown) => {
  console.error('[backfill] 실패', error);
  process.exit(1);
});
