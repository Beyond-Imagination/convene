import { participantEntry } from '@/reports/domain/entries';
import { MeetingReport } from '@/reports/domain/meeting-report';
import { NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects';

import { InMemoryReportRepository } from './in-memory-report.repository';

const startedAt = new Date('2026-01-01T00:00:00Z');

const makeReport = (id: string, meetingId: string, endedAtMs = 30 * 60_000) =>
  MeetingReport.fromEndedMeeting({
    id,
    meetingId,
    code: `code-${meetingId}`,
    source: 'web',
    externalReference: NO_EXTERNAL_REFERENCE,
    startedAt,
    endedAt: new Date(startedAt.getTime() + endedAtMs),
    participants: [
      participantEntry({
        id: 'p1',
        nickname: 'a',
        joinedAt: startedAt,
        leftAt: new Date(startedAt.getTime() + endedAtMs),
      }),
    ],
    chat: [],
  });

describe('InMemoryReportRepository', () => {
  it('save한 MeetingReport를 같은 id로 findById 했을 때 동일 인스턴스를 돌려준다', async () => {
    const repo = new InMemoryReportRepository();
    const report = makeReport('r1', 'mtg-1');
    await repo.save(report);
    expect(await repo.findById('r1')).toBe(report);
  });

  it('등록되지 않은 id는 null을 돌려준다', async () => {
    const repo = new InMemoryReportRepository();
    expect(await repo.findById('missing')).toBeNull();
  });

  it('findByMeetingId로 회의 1건당 회의록 1건을 조회한다', async () => {
    const repo = new InMemoryReportRepository();
    const a = makeReport('r1', 'mtg-1');
    const b = makeReport('r2', 'mtg-2');
    await repo.save(a);
    await repo.save(b);
    expect(await repo.findByMeetingId('mtg-1')).toBe(a);
    expect(await repo.findByMeetingId('mtg-2')).toBe(b);
    expect(await repo.findByMeetingId('mtg-unknown')).toBeNull();
  });

  it('listRecent는 endedAt 내림차순으로 limit만큼 반환한다', async () => {
    const repo = new InMemoryReportRepository();
    const r1 = makeReport('r1', 'mtg-1', 10 * 60_000);
    const r2 = makeReport('r2', 'mtg-2', 30 * 60_000);
    const r3 = makeReport('r3', 'mtg-3', 20 * 60_000);
    await repo.save(r1);
    await repo.save(r2);
    await repo.save(r3);
    expect(await repo.listRecent(2)).toEqual([r2, r3]);
    expect(await repo.listRecent(10)).toEqual([r2, r3, r1]);
    expect(await repo.listRecent(0)).toEqual([]);
  });

  it('limit이 음수면 throw', async () => {
    const repo = new InMemoryReportRepository();
    await expect(repo.listRecent(-1)).rejects.toThrow(/non-negative/);
  });

  it('같은 id로 다시 save하면 마지막 인스턴스로 덮어쓴다', async () => {
    const repo = new InMemoryReportRepository();
    const a = makeReport('r1', 'mtg-1', 10 * 60_000);
    const b = makeReport('r1', 'mtg-1', 20 * 60_000);
    await repo.save(a);
    await repo.save(b);
    expect(await repo.findById('r1')).toBe(b);
  });
});
