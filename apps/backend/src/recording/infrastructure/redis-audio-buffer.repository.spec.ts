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

  it('append 한 번도 호출된 적 없는 회의는 consume이 빈 배열을 돌려준다', async () => {
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  describe('markCaptureGap', () => {
    // 16kHz mono pcm_s16le = 32000 byte/s.
    const ONE_SECOND = 32_000;
    const pcm = (seconds: number): Buffer => Buffer.alloc(ONE_SECOND * seconds, 1);

    it('공백만큼 시간축을 밀되 무음 byte 는 저장하지 않는다', async () => {
      await repo.append('abc12xyz', 's1', pcm(4));
      await repo.markCaptureGap('abc12xyz', 's1', 10_000);
      await repo.append('abc12xyz', 's1', pcm(4));

      // 공백 앞 4초를 먼저 받는다(공백이 drain 경계).
      const before = await repo.drainAvailable('abc12xyz', 's1', 0);
      expect(before.startMs).toBe(0);
      expect(before.pcm.length).toBe(ONE_SECOND * 4);

      // 공백 뒤 4초는 4초(앞 오디오) + 10초(공백) = 14초 지점에서 시작한다.
      const after = await repo.drainAvailable('abc12xyz', 's1', 0);
      expect(after.startMs).toBe(14_000);
      expect(after.pcm.length).toBe(ONE_SECOND * 4);

      // 저장된 것은 실제 오디오 8초뿐 — 공백 10초는 byte 로 남지 않는다.
      expect(before.pcm.length + after.pcm.length).toBe(ONE_SECOND * 8);
    });

    it('공백 앞 데이터가 없으면 커서만 앞당긴다', async () => {
      await repo.markCaptureGap('abc12xyz', 's1', 5_000);
      await repo.append('abc12xyz', 's1', pcm(2));
      const drained = await repo.drainAvailable('abc12xyz', 's1', 0);
      expect(drained.startMs).toBe(5_000);
      expect(drained.pcm.length).toBe(ONE_SECOND * 2);
    });

    it('공백이 연달아 발생해도 각각 누적된다', async () => {
      await repo.markCaptureGap('abc12xyz', 's1', 3_000);
      await repo.markCaptureGap('abc12xyz', 's1', 2_000);
      await repo.append('abc12xyz', 's1', pcm(1));
      const drained = await repo.drainAvailable('abc12xyz', 's1', 0);
      expect(drained.startMs).toBe(5_000);
    });

    it('공백 경계에서는 keepLastBytes overlap 을 남기지 않는다', async () => {
      // 공백 뒤 오디오와는 이어지지 않으므로 단어 잘림 보호가 의미 없다.
      await repo.append('abc12xyz', 's1', pcm(4));
      await repo.markCaptureGap('abc12xyz', 's1', 10_000);
      await repo.append('abc12xyz', 's1', pcm(4));

      const before = await repo.drainAvailable('abc12xyz', 's1', ONE_SECOND * 2);
      expect(before.pcm.length).toBe(ONE_SECOND * 4);
    });

    it('공백 이후 남은 오디오도 consume 에서 올바른 startMs 를 갖는다', async () => {
      await repo.append('abc12xyz', 's1', pcm(4));
      await repo.markCaptureGap('abc12xyz', 's1', 10_000);
      await repo.append('abc12xyz', 's1', pcm(4));
      await repo.drainAvailable('abc12xyz', 's1', 0);

      const consumed = await repo.consume('abc12xyz');
      expect(consumed[0].startMs).toBe(14_000);
      expect(consumed[0].audio.length).toBe(ONE_SECOND * 4);
    });
  });

  it('단일 participant의 단일 chunk가 그대로 round-trip 된다', async () => {
    const chunk = Buffer.from('hello');
    await repo.append('abc12xyz', 's1', chunk);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('s1');
    expect(result[0].audio.equals(chunk)).toBe(true);
  });

  it('같은 participant의 여러 chunk는 시간순 concat 된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('foo'));
    await repo.append('abc12xyz', 's1', Buffer.from('bar'));
    await repo.append('abc12xyz', 's1', Buffer.from('baz'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].audio.toString()).toBe('foobarbaz');
  });

  it('서로 다른 participant는 별도 entry로 분리된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.append('abc12xyz', 's2', Buffer.from('B'));
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(2);
    const byPid = new Map(result.map((e) => [e.participantId, e.audio.toString()]));
    expect(byPid.get('s1')).toBe('A');
    expect(byPid.get('s2')).toBe('B');
  });

  it('consume 후 같은 code로 다시 consume 하면 빈 배열(즉시 폐기)', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('x'));
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  it('markStarted 후 consume 결과에 startedAtMs가 포함된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.markStarted('abc12xyz', 's1', 1_700_000_000_000);
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBe(1_700_000_000_000);
  });

  it('markStarted가 같은 (code, pid)에 중복 호출되어도 첫 호출 값만 유지된다', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    await repo.markStarted('abc12xyz', 's1', 1000);
    await repo.markStarted('abc12xyz', 's1', 2000);
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBe(1000);
  });

  it('markStarted 없이 consume 한 경우 startedAtMs는 undefined', async () => {
    await repo.append('abc12xyz', 's1', Buffer.from('A'));
    const result = await repo.consume('abc12xyz');
    expect(result[0].startedAtMs).toBeUndefined();
  });

  it('consume이 markStarted 키도 함께 폐기한다(다음 consume에 잔존 X)', async () => {
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

    it('append 한 회의 코드와 participant가 enumerate 된다', async () => {
      await repo.append('aaa11aaa', 's1', Buffer.from('A'));
      await repo.append('aaa11aaa', 's2', Buffer.from('B'));
      await repo.append('bbb22bbb', 's3', Buffer.from('C'));
      expect((await repo.listActiveMeetings()).sort()).toEqual(['aaa11aaa', 'bbb22bbb']);
      expect((await repo.listActiveParticipants('aaa11aaa')).sort()).toEqual(['s1', 's2']);
    });
  });

  describe('drainAvailable', () => {
    const KEEP_LAST = 32_000;

    it('누적된 chunk가 없으면 빈 pcm + startMs=0', async () => {
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.pcm.length).toBe(0);
      expect(res.startMs).toBe(0);
    });

    it('누적량이 keepLastBytes보다 크면 (누적-keepLast) bytes 만큼 drain, 끝은 남는다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 5_000, 0xab));
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.pcm.length).toBe(5_000);
      expect(res.startMs).toBe(0);
    });

    it('두번째 drain의 startMs는 이전 drain 끝 위치(byte)를 ms로 환산한 값', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(64_000));
      const first = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(first.startMs).toBe(0);
      expect(first.pcm.length).toBe(32_000);
      await repo.append('abc12xyz', 's1', Buffer.alloc(32_000));
      const second = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(second.startMs).toBe(1_000);
      expect(second.pcm.length).toBe(32_000);
    });

    it('markStarted 후 drain의 결과에 startedAtMs가 포함된다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 1_000));
      await repo.markStarted('abc12xyz', 's1', 1_700_000_000_000);
      const res = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(res.startedAtMs).toBe(1_700_000_000_000);
    });

    it('drain 후 consume은 잔여 KEEP_LAST 분만 audio로, startMs는 drain 끝 위치를 가리킨다', async () => {
      await repo.append('abc12xyz', 's1', Buffer.alloc(KEEP_LAST + 5_000));
      await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      const consumed = await repo.consume('abc12xyz');
      expect(consumed[0].audio.length).toBe(KEEP_LAST);
      expect(consumed[0].startMs).toBe(156); // 5000 byte / 32000 byte/s
    });
  });

  it('UTF-8 비호환 binary chunk도 그대로 round-trip 된다', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0xab]);
    await repo.append('abc12xyz', 's1', binary);
    const result = await repo.consume('abc12xyz');
    expect(result[0].audio.equals(binary)).toBe(true);
  });
});
