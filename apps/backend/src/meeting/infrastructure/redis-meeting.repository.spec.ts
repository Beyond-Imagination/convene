import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { externalReference } from '@/shared-kernel/domain/value-objects';

import { RedisMeetingRepository } from './redis-meeting.repository';

const t0 = new Date('2026-01-01T00:00:00Z');
const t30s = new Date('2026-01-01T00:00:30Z');
const t1m = new Date('2026-01-01T00:01:00Z');

const makeMeeting = (codeStr: string) =>
  Meeting.create({
    code: MeetingCode.from(codeStr),
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: t0,
    hostToken: 'host-token-1',
    title: null,
  });

describe('RedisMeetingRepository', () => {
  let redis: Redis;
  let repo: RedisMeetingRepository;

  beforeEach(() => {
    // ioredis-mock 는 ioredis API 호환의 in-memory 에뮬레이터.
    // unit spec 에서는 실 redis 없이 동작 검증에만 사용한다.
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisMeetingRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('등록되지 않은 code 는 null 을 돌려준다', async () => {
    expect(await repo.findByCode('unknown0')).toBeNull();
  });

  it('save 후 findByCode 는 동일한 snapshot 의 Meeting 을 돌려준다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('s1', 'alice', t30s);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    expect(found).not.toBeNull();
    expect(found!.snapshot()).toEqual(meeting.snapshot());
  });

  it('round-trip 후에도 close 상태와 endedAt 이 보존된다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('s1', 'alice', t30s);
    meeting.close(t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    expect(found).not.toBeNull();
    expect(found!.isOpen).toBe(false);
    expect(found!.endedAt?.getTime()).toBe(t1m.getTime());
    expect(found!.snapshot()).toEqual(meeting.snapshot());
  });

  it('leave 한 Participant 의 leftAt 도 그대로 round-trip 된다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('s1', 'alice', t30s);
    meeting.removeParticipant('s1', t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    const p = found!.findParticipant('s1');
    expect(p?.leftAt?.getTime()).toBe(t1m.getTime());
    expect(p?.isActive).toBe(false);
  });

  it('같은 code 로 두 번 save 하면 마지막 상태로 덮어쓴다', async () => {
    const m1 = makeMeeting('abc12xyz');
    await repo.save(m1);
    const m2 = makeMeeting('abc12xyz');
    m2.addParticipant('s2', 'bob', t30s);
    await repo.save(m2);

    const found = await repo.findByCode('abc12xyz');
    expect(found!.activeParticipantCount).toBe(1);
    expect(found!.findParticipant('s2')?.nickname).toBe('bob');
  });

  it('서로 다른 code 의 Meeting 은 독립적으로 보관된다', async () => {
    const a = makeMeeting('abc12xyz');
    const b = makeMeeting('xyz99aaa');
    await repo.save(a);
    await repo.save(b);

    expect((await repo.findByCode('abc12xyz'))!.code.value).toBe('abc12xyz');
    expect((await repo.findByCode('xyz99aaa'))!.code.value).toBe('xyz99aaa');
  });

  it('externalReference 의 issueId 도 round-trip 된다(v2 노션 대비)', async () => {
    const m = Meeting.create({
      code: MeetingCode.from('abc12xyz'),
      source: 'notion-issue',
      externalReference: externalReference({ issueId: 'NOTION-42' }),
      idleTimeout: IdleTimeout.default(),
      startedAt: t0,
      hostToken: 'host-token-1',
      title: null,
    });
    await repo.save(m);

    const found = await repo.findByCode('abc12xyz');
    expect(found!.source).toBe('notion-issue');
    expect(found!.externalReference.issueId).toBe('NOTION-42');
  });
});
