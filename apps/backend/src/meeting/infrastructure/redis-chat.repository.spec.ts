import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { chatEntry } from '@/shared-kernel/domain/value-objects';

import { RedisChatRepository } from './redis-chat.repository';

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-01T00:00:01Z');
const t2 = new Date('2026-01-01T00:00:02Z');

describe('RedisChatRepository', () => {
  let redis: Redis;
  let repo: RedisChatRepository;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisChatRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('등록되지 않은 code 는 빈 배열을 돌려준다', async () => {
    expect(await repo.listByCode('abc12xyz')).toEqual([]);
  });

  it('append 한 entry 를 시간순으로 그대로 돌려준다', async () => {
    const e1 = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    const e2 = chatEntry({ nickname: 'bob', text: 'hello', sentAt: t1 });
    const e3 = chatEntry({ nickname: 'alice', text: 'bye', sentAt: t2 });
    await repo.append('abc12xyz', e1);
    await repo.append('abc12xyz', e2);
    await repo.append('abc12xyz', e3);

    const list = await repo.listByCode('abc12xyz');
    expect(list).toEqual([e1, e2, e3]);
  });

  it('서로 다른 code 의 채팅은 격리된다', async () => {
    const e1 = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    const e2 = chatEntry({ nickname: 'bob', text: 'hello', sentAt: t1 });
    await repo.append('abc12xyz', e1);
    await repo.append('xyz99aaa', e2);

    expect(await repo.listByCode('abc12xyz')).toEqual([e1]);
    expect(await repo.listByCode('xyz99aaa')).toEqual([e2]);
  });

  it('sentAt 은 Date 인스턴스로 복원된다', async () => {
    const e = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    await repo.append('abc12xyz', e);
    const [restored] = await repo.listByCode('abc12xyz');
    expect(restored.sentAt).toBeInstanceOf(Date);
    expect(restored.sentAt.getTime()).toBe(t0.getTime());
  });
});
