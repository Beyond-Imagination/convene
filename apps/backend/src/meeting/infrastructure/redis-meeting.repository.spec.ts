import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

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
    // ioredis-mock는 ioredis API 호환의 in-memory 에뮬레이터.
    // unit spec에서는 실 redis 없이 동작 검증에만 사용한다.
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisMeetingRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('등록되지 않은 code는 null을 돌려준다', async () => {
    expect(await repo.findByCode('unknown0')).toBeNull();
  });

  it('listOpenCodes는 아직 종료되지 않은 회의 code만 돌려준다', async () => {
    const open = makeMeeting('abc12xyz');
    const closed = makeMeeting('def34uvw');
    closed.close(t1m);
    await repo.save(open);
    await repo.save(closed);

    await expect(repo.listOpenCodes()).resolves.toEqual(['abc12xyz']);
  });

  it('회의를 종료해 다시 저장하면 listOpenCodes에서 빠진다', async () => {
    const meeting = makeMeeting('abc12xyz');
    await repo.save(meeting);
    meeting.close(t1m);
    await repo.save(meeting);

    await expect(repo.listOpenCodes()).resolves.toEqual([]);
  });

  it('열린 회의가 없으면 빈 배열을 돌려준다', async () => {
    await expect(repo.listOpenCodes()).resolves.toEqual([]);
  });

  it('save 후 findByCode는 동일한 snapshot의 Meeting을 돌려준다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('s1', 'alice', t30s);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    expect(found).not.toBeNull();
    expect(found!.snapshot()).toEqual(meeting.snapshot());
  });

  it('round-trip 후에도 close 상태와 endedAt이 보존된다', async () => {
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

  it('leave 한 Participant의 leftAt도 그대로 round-trip 된다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('s1', 'alice', t30s);
    meeting.removeParticipant('s1', t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    const p = found!.findParticipant('s1');
    expect(p?.leftAt?.getTime()).toBe(t1m.getTime());
    expect(p?.isActive).toBe(false);
  });

  it('연결 정보(connectionId·끊김 시각)가 round-trip 된다 — 재시작 후에도 재접속으로 붙어야 한다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('p-1', 'alice', t30s, 'socket-a');
    meeting.disconnectParticipant('socket-a', t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');
    expect(found!.findByConnectionId('socket-a')?.id).toBe('p-1');
    expect(found!.findParticipant('p-1')?.disconnectedAt?.getTime()).toBe(t1m.getTime());
  });

  it('같은 code로 두 번 save 하면 마지막 상태로 덮어쓴다', async () => {
    const m1 = makeMeeting('abc12xyz');
    await repo.save(m1);
    const m2 = makeMeeting('abc12xyz');
    m2.addParticipant('s2', 'bob', t30s);
    await repo.save(m2);

    const found = await repo.findByCode('abc12xyz');
    expect(found!.activeParticipantCount).toBe(1);
    expect(found!.findParticipant('s2')?.nickname).toBe('bob');
  });

  it('서로 다른 code의 Meeting은 독립적으로 보관된다', async () => {
    const a = makeMeeting('abc12xyz');
    const b = makeMeeting('xyz99aaa');
    await repo.save(a);
    await repo.save(b);

    expect((await repo.findByCode('abc12xyz'))!.code.value).toBe('abc12xyz');
    expect((await repo.findByCode('xyz99aaa'))!.code.value).toBe('xyz99aaa');
  });

  it('externalReference의 issueId도 round-trip 된다(v2 노션 대비)', async () => {
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

  describe('캐시 수명', () => {
    it('진행 중인 회의는 만료시키지 않는다', async () => {
      const meeting = makeMeeting('abc12xyz');
      await repo.save(meeting);

      await expect(redis.ttl('meeting:abc12xyz')).resolves.toBe(-1);
    });

    it('종료된 회의는 만료 시각을 붙여 캐시가 무한히 자라지 않게 한다', async () => {
      const meeting = makeMeeting('abc12xyz');
      meeting.close(t1m);
      await repo.save(meeting);

      await expect(redis.ttl('meeting:abc12xyz')).resolves.toBeGreaterThan(0);
    });
  });

  describe('열린 회의 색인 재구축', () => {
    it('한 번도 채운 적 없는 색인은 cold 로 판정한다', async () => {
      await expect(repo.isOpenIndexWarm()).resolves.toBe(false);
    });

    it('primeOpenIndex 이후에는 warm 으로 판정한다', async () => {
      await repo.primeOpenIndex(['abc12xyz']);

      await expect(repo.isOpenIndexWarm()).resolves.toBe(true);
    });

    it('primeOpenIndex는 기존 색인을 통째로 갈아끼운다', async () => {
      const stale = makeMeeting('stale123');
      await repo.save(stale);

      await repo.primeOpenIndex(['abc12xyz', 'xyz99aaa']);

      await expect(repo.listOpenCodes()).resolves.toEqual(
        expect.arrayContaining(['abc12xyz', 'xyz99aaa']),
      );
      await expect(repo.listOpenCodes()).resolves.toHaveLength(2);
    });

    it('열린 회의가 하나도 없어도 warm 으로 남는다', async () => {
      await repo.primeOpenIndex([]);

      await expect(repo.isOpenIndexWarm()).resolves.toBe(true);
      await expect(repo.listOpenCodes()).resolves.toEqual([]);
    });
  });
});
