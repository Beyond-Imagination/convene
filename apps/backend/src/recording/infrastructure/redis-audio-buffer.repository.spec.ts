import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { RedisAudioBufferRepository } from './redis-audio-buffer.repository';

describe('RedisAudioBufferRepository', () => {
  let redis: Redis;
  let repo: RedisAudioBufferRepository;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisAudioBufferRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('append 한 번도 호출된 적 없는 회의는 consume 이 빈 배열을 돌려준다', async () => {
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('단일 participant 의 단일 chunk 가 그대로 round-trip 된다', async () => {
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', 's1', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('s1');
    expect(result[0].audio.equals(chunk)).toBe(true);
  });

  it('같은 participant 의 여러 chunk 는 시간순 concat 된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('foo'));
    await repo.append('abc12xyz', 's1', Buffer.from('bar'));
    await repo.append('abc12xyz', 's1', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].audio.toString()).toBe('foobarbaz');
  });

  it('서로 다른 participant 는 별도 entry 로 분리된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.append('abc12xyz', 's2', Buffer.from('B'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(2);
    const byPid = new Map(result.map((e) => [e.participantId, e.audio.toString()]));
    expect(byPid.get('s1')).toBe('A');
    expect(byPid.get('s2')).toBe('B');
  });

  it('consume 후 같은 code 로 다시 consume 하면 빈 배열(즉시 폐기)', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('markStarted 후 consume 결과에 startedAtMs 가 포함된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.markStarted('abc12xyz', 's1', 1_700_000_000_000);
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBe(1_700_000_000_000);
  });

  it('markStarted 가 같은 (code, pid) 에 중복 호출되어도 첫 호출 값만 유지된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.markStarted('abc12xyz', 's1', 1000);
    await repo.markStarted('abc12xyz', 's1', 2000);
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBe(1000);
  });

  it('markStarted 없이 consume 한 경우 startedAtMs 는 undefined', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBeUndefined();
  });

  it('consume 이 markStarted 키도 함께 폐기한다(다음 consume 에 잔존 X)', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.markStarted('abc12xyz', 's1', 1000);
    await repo.consume('abc12xyz');
    await repo.append('abc12xyz', 's1', Buffer.from('B'));
    const next = await repo.consume('abc12xyz');
    expect(next[0].startedAtMs).toBeUndefined();
  });

  describe('listActiveMeetings / listActiveParticipants', () => {
    it('append 한 적 없으면 빈 배열', async () => {
      expect(await repo.listActiveMeetings()).toEqual([]);
      expect(await repo.listActiveParticipants('abc12xyz')).toEqual([]);
    });

    it('append 한 회의 코드와 participant 가 enumerate 된다', async () => {
      await repo.append('aaa11aaa', 's1', Buffer.from('A'));
      await repo.append('aaa11aaa', 's2', Buffer.from('B'));
      await repo.append('bbb22bbb', 's3', Buffer.from('C'));
      expect((await repo.listActiveMeetings()).sort()).toEqual(['aaa11aaa', 'bbb22bbb']);
      expect((await repo.listActiveParticipants('aaa11aaa')).sort()).toEqual(['s1', 's2']);
    });
  });

  describe('drainAvailable', () => {
    const KEEP_LAST = 32_000;

    it('누적된 chunk 가 없으면 빈 pcm + startMs=0', async () => {
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.pcm.length).toBe(0);
      expect(res.startMs).toBe(0);
    });

    it('누적량이 keepLastBytes 보다 크면 (누적-keepLast) bytes 만큼 drain, 끝은 남는다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 5_000, 0xab));
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.pcm.length).toBe(5_000);
      expect(res.startMs).toBe(0);
    });

    it('두번째 drain 의 startMs 는 이전 drain 끝 위치(byte) 를 ms 로 환산한 값', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(64_000));
      const first = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(first.startMs).toBe(0);
      expect(first.pcm.length).toBe(32_000);
      await repo.append('abc12xyz', 's1', Buffer.alloc(32_000));
      const second = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(second.startMs).toBe(1_000);
      expect(second.pcm.length).toBe(32_000);
    });

    it('markStarted 후 drain 의 결과에 startedAtMs 가 포함된다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 1_000));
      await repo.markStarted('abc12xyz', 's1', 1_700_000_000_000);
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.startedAtMs).toBe(1_700_000_000_000);
    });

    it('drain 후 consume 은 잔여 KEEP_LAST 분만 audio 로, startMs 는 drain 끝 위치를 가리킨다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 5_000));
      await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      const consumed = await repo.consume('abc12xyz');
      expect(consumed[0].audio.length).toBe(KEEP_LAST);
      expect(consumed[0].startMs).toBe(156); // 5000 byte / 32000 byte/s
    });
  });

  it('UTF-8 비호환 binary chunk 도 그대로 round-trip 된다', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0xab]);
    await repo.append('abc12xyz', 's1', binary);
    const result = await repo.consume('abc12xyz');
    expect(result[0].audio.equals(binary)).toBe(true);
  });
});
