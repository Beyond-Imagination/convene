import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { externalReference } from '@/shared-kernel/domain/value-objects';

import { InMemoryMeetingRepository } from './in-memory-meeting.repository';

const t0 = new Date('2026-01-01T00:00:00Z');

const makeMeeting = (codeStr: string) =>
  Meeting.create({
    code: MeetingCode.from(codeStr),
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: t0,
    hostToken: 'host-token-1',
  });

describe('InMemoryMeetingRepository', () => {
  it('save한 Meeting을 같은 code로 findByCode 했을 때 동일 인스턴스를 돌려준다', async () => {
    const repo = new InMemoryMeetingRepository();
    const meeting = makeMeeting('abc12xyz');
    await repo.save(meeting);
    const found = await repo.findByCode('abc12xyz');
    expect(found).toBe(meeting);
  });

  it('등록되지 않은 code는 null을 돌려준다', async () => {
    const repo = new InMemoryMeetingRepository();
    expect(await repo.findByCode('unknown00')).toBeNull();
  });

  it('같은 code로 다시 save하면 마지막 Meeting으로 덮어쓴다', async () => {
    const repo = new InMemoryMeetingRepository();
    const m1 = makeMeeting('abc12xyz');
    const m2 = makeMeeting('abc12xyz');
    await repo.save(m1);
    await repo.save(m2);
    const found = await repo.findByCode('abc12xyz');
    expect(found).toBe(m2);
  });

  it('서로 다른 code의 Meeting은 독립적으로 보관된다', async () => {
    const repo = new InMemoryMeetingRepository();
    const m1 = makeMeeting('abc12xyz');
    const m2 = makeMeeting('xyz99aaa');
    await repo.save(m1);
    await repo.save(m2);
    expect(await repo.findByCode('abc12xyz')).toBe(m1);
    expect(await repo.findByCode('xyz99aaa')).toBe(m2);
  });
});
