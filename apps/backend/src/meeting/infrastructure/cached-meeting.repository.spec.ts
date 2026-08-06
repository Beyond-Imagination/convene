import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { Meeting, MeetingSnapshot } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports/meeting.repository';
import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

import { CachedMeetingRepository } from './cached-meeting.repository';
import { RedisMeetingRepository } from './redis-meeting.repository';

const t0 = new Date('2026-01-01T00:00:00Z');
const t30s = new Date('2026-01-01T00:00:30Z');
const t1m = new Date('2026-01-01T00:01:00Z');

const makeMeeting = (codeStr: string): Meeting =>
  Meeting.create({
    code: MeetingCode.from(codeStr),
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: t0,
    hostToken: `host-${codeStr}`,
    title: null,
  });

/** 호출을 세는 in-memory 원본. Mongo 어댑터 자리에 끼운다. */
const makeOrigin = () => {
  const stored = new Map<string, MeetingSnapshot>();
  const calls = { findByCode: 0, save: 0, listOpenCodes: 0 };
  const repository: MeetingRepository = {
    findByCode: async (code) => {
      calls.findByCode += 1;
      const snapshot = stored.get(code);
      return snapshot === undefined ? null : Meeting.fromSnapshot(snapshot);
    },
    save: async (meeting) => {
      calls.save += 1;
      stored.set(meeting.code.value, meeting.snapshot());
    },
    listOpenCodes: async () => {
      calls.listOpenCodes += 1;
      return Array.from(stored.values())
        .filter((s) => s.status === 'open')
        .map((s) => s.code);
    },
  };
  return { repository, calls, stored };
};

describe('CachedMeetingRepository', () => {
  let redis: Redis;
  let cache: RedisMeetingRepository;
  let origin: ReturnType<typeof makeOrigin>;
  let repo: CachedMeetingRepository;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    cache = new RedisMeetingRepository(redis);
    origin = makeOrigin();
    repo = new CachedMeetingRepository(cache, origin.repository);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  describe('save', () => {
    it('캐시에 없던 회의는 원본에 기록한다', async () => {
      await repo.save(makeMeeting('abc12xyz'));

      expect(origin.calls.save).toBe(1);
    });

    it('lastActiveAt만 바뀐 저장은 원본을 건드리지 않는다', async () => {
      const meeting = makeMeeting('abc12xyz');
      await repo.save(meeting);

      meeting.markActive(t30s);
      await repo.save(meeting);

      expect(origin.calls.save).toBe(1);
    });

    it('lastActiveAt만 바뀐 저장도 캐시에는 반영한다', async () => {
      const meeting = makeMeeting('abc12xyz');
      await repo.save(meeting);

      meeting.markActive(t30s);
      await repo.save(meeting);

      const cached = await cache.findByCode('abc12xyz');
      expect(cached!.lastActiveAt).toEqual(t30s);
    });

    it('참가자가 바뀌면 원본에 기록한다', async () => {
      const meeting = makeMeeting('abc12xyz');
      await repo.save(meeting);

      meeting.addParticipant('socket-a', '가', t30s);
      await repo.save(meeting);

      expect(origin.calls.save).toBe(2);
    });

    it('회의가 종료되면 원본에 기록한다', async () => {
      const meeting = makeMeeting('abc12xyz');
      await repo.save(meeting);

      meeting.close(t1m);
      await repo.save(meeting);

      expect(origin.calls.save).toBe(2);
    });
  });

  describe('findByCode', () => {
    it('캐시에 있으면 원본을 읽지 않는다', async () => {
      await repo.save(makeMeeting('abc12xyz'));
      origin.calls.findByCode = 0;

      const found = await repo.findByCode('abc12xyz');

      expect(found!.code.value).toBe('abc12xyz');
      expect(origin.calls.findByCode).toBe(0);
    });

    it('캐시에 없으면 원본에서 읽어 온다', async () => {
      await origin.repository.save(makeMeeting('abc12xyz'));

      const found = await repo.findByCode('abc12xyz');

      expect(found!.code.value).toBe('abc12xyz');
    });

    it('원본에서 읽어 온 회의는 캐시에 채워 둔다', async () => {
      await origin.repository.save(makeMeeting('abc12xyz'));

      await repo.findByCode('abc12xyz');

      expect(await cache.findByCode('abc12xyz')).not.toBeNull();
    });

    it('원본에도 없으면 null을 돌려준다', async () => {
      await expect(repo.findByCode('missing0')).resolves.toBeNull();
    });
  });

  describe('listOpenCodes', () => {
    it('캐시 색인이 비어 있으면 원본 질의로 재구축한다', async () => {
      await origin.repository.save(makeMeeting('abc12xyz'));

      await expect(repo.listOpenCodes()).resolves.toEqual(['abc12xyz']);
    });

    it('재구축 이후에는 원본을 다시 질의하지 않는다', async () => {
      await origin.repository.save(makeMeeting('abc12xyz'));
      await repo.listOpenCodes();
      origin.calls.listOpenCodes = 0;

      await repo.listOpenCodes();

      expect(origin.calls.listOpenCodes).toBe(0);
    });

    it('열린 회의가 없는 것과 캐시가 비어 있는 것을 구분한다', async () => {
      await repo.listOpenCodes();
      origin.calls.listOpenCodes = 0;

      await expect(repo.listOpenCodes()).resolves.toEqual([]);
      expect(origin.calls.listOpenCodes).toBe(0);
    });
  });
});
