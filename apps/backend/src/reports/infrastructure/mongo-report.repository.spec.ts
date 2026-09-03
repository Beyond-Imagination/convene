import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection } from 'mongoose';

import { participantEntry } from '@/reports/domain/entries/participant-entry';
import { transcriptSegment } from '@/reports/domain/entries/transcript-segment';
import { MeetingReport } from '@/reports/domain/meeting-report';
import { notionPushResult } from '@/reports/domain/value-objects/notion-push-result';
import { reportListCriteria } from '@/reports/domain/value-objects/report-list-query';
import { externalReference, NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects/external-reference';
import { reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

import { MongoReportRepository } from './mongo-report.repository';

jest.setTimeout(60_000);

const startedAt = new Date('2026-01-01T00:00:00Z');

const makeReport = (id: string, meetingId: string, endedAtMs = 30 * 60_000) =>
  MeetingReport.fromEndedMeeting({
    id,
    meetingId,
    code: `code-${meetingId}`,
    source: 'web',
    meetingType: 'general',
    externalReference: NO_EXTERNAL_REFERENCE,
    startedAt,
    endedAt: new Date(startedAt.getTime() + endedAtMs),
    participants: [
      participantEntry({
        id: 'p1',
        nickname: 'alice',
        joinedAt: startedAt,
        leftAt: new Date(startedAt.getTime() + endedAtMs),
      }),
    ],
    chat: [],
  });

describe('MongoReportRepository', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let repo: MongoReportRepository;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = createConnection(mongod.getUri(), { dbName: 'test-reports' });
    await connection.asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    if (connection.db) {
      await connection.db.dropDatabase();
    }
    repo = new MongoReportRepository(connection);
  });

  it('등록되지 않은 id는 null을 돌려준다', async () => {
    expect(await repo.findById('missing')).toBeNull();
  });

  it('save 후 findById는 동일한 snapshot의 MeetingReport를 돌려준다', async () => {
    const r = makeReport('r1', 'mtg-1');
    await repo.save(r);
    const found = await repo.findById('r1');
    expect(found).not.toBeNull();
    expect(found!.snapshot()).toEqual(r.snapshot());
  });

  it('findByMeetingId로 회의 1건당 회의록 1건을 조회한다', async () => {
    const a = makeReport('r1', 'mtg-1');
    const b = makeReport('r2', 'mtg-2');
    await repo.save(a);
    await repo.save(b);
    expect((await repo.findByMeetingId('mtg-1'))!.id).toBe('r1');
    expect((await repo.findByMeetingId('mtg-2'))!.id).toBe('r2');
    expect(await repo.findByMeetingId('mtg-unknown')).toBeNull();
  });

  it('같은 id로 두 번 save 하면 마지막 상태로 덮어쓴다(upsert)', async () => {
    const r = makeReport('r1', 'mtg-1', 10 * 60_000);
    await repo.save(r);
    r.applyTranscript([transcriptSegment({ text: 'hi', startMs: 0, endMs: 100 })]);
    await repo.save(r);
    const found = await repo.findById('r1');
    expect(found!.transcript).toHaveLength(1);
    expect(found!.pipeline.sttStatus).toBe('done');
  });

  it('findPage는 latest 정렬로 페이지를 잘라 전체 개수와 함께 반환한다', async () => {
    const r1 = makeReport('r1', 'mtg-1', 10 * 60_000);
    const r2 = makeReport('r2', 'mtg-2', 30 * 60_000);
    const r3 = makeReport('r3', 'mtg-3', 20 * 60_000);
    await repo.save(r1);
    await repo.save(r2);
    await repo.save(r3);

    const first = await repo.findPage(reportListCriteria({ page: 1, size: 2, sort: 'latest' }));
    expect(first.items.map((r) => r.id)).toEqual(['r2', 'r3']);
    expect(first.totalItems).toBe(3);

    const second = await repo.findPage(reportListCriteria({ page: 2, size: 2, sort: 'latest' }));
    expect(second.items.map((r) => r.id)).toEqual(['r1']);
    expect(second.totalItems).toBe(3);
  });

  it('범위를 벗어난 page는 빈 목록이지만 전체 개수는 그대로다', async () => {
    await repo.save(makeReport('r1', 'mtg-1'));
    const page = await repo.findPage(reportListCriteria({ page: 5, size: 20, sort: 'latest' }));
    expect(page.items).toEqual([]);
    expect(page.totalItems).toBe(1);
  });

  it('완료 상태(transcript + summary + notion push)가 round-trip 된다', async () => {
    const r = makeReport('r1', 'mtg-1');
    r.applyTranscript([transcriptSegment({ text: 'hi', startMs: 0, endMs: 100 })]);
    r.applySummary(
      reportSummary({
        title: '주간 회의',
        overview: '요약',
        decisions: ['결정 1'],
        actionItems: [{ task: '문서 작성', owner: 'alice' }],
        keyTopics: [{ topic: '로드맵', points: ['A', 'B'] }],
      }),
    );
    r.attachNotionPushResult(
      notionPushResult({ pageId: 'p1', at: new Date('2026-01-01T01:00:00Z') }),
    );
    await repo.save(r);

    const found = await repo.findById('r1');
    expect(found!.snapshot()).toEqual(r.snapshot());
    expect(found!.isFinalized).toBe(true);
    expect(found!.pushedToNotion?.pageId).toBe('p1');
  });

  it('externalReference.issueId도 round-trip 된다(v2 노션 대비)', async () => {
    const r = MeetingReport.fromEndedMeeting({
      id: 'r1',
      meetingId: 'mtg-1',
      code: 'abc12xyz',
      source: 'notion-issue',
      meetingType: 'retrospective',
      externalReference: externalReference({ issueId: 'NOTION-42' }),
      startedAt,
      endedAt: new Date(startedAt.getTime() + 10 * 60_000),
      participants: [],
      chat: [],
    });
    await repo.save(r);
    const found = await repo.findById('r1');
    expect(found!.source).toBe('notion-issue');
    expect(found!.externalReference.issueId).toBe('NOTION-42');
  });

  it('실패 누적(pipeline.failures)도 round-trip 된다', async () => {
    const r = makeReport('r1', 'mtg-1');
    const failAt = new Date('2026-01-01T01:00:00Z');
    r.applyTranscript([]);
    r.markSummaryFailed('llm boom', failAt);
    await repo.save(r);

    const found = await repo.findById('r1');
    expect(found!.pipeline.summaryStatus).toBe('failed');
    expect(found!.pipeline.failures).toHaveLength(1);
    expect(found!.pipeline.failures[0]).toEqual({
      stage: 'summary',
      error: 'llm boom',
      at: failAt,
    });
  });
});
