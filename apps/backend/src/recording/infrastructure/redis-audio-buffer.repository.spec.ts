import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { RedisAudioBufferRepository } from './redis-audio-buffer.repository';

/** 16kHz mono pcm_s16le = 32000 byte/s = 32 byte/ms. */
const BYTES_PER_MS = 32;
const pcm = (ms: number, fill = 1): Buffer => Buffer.alloc(ms * BYTES_PER_MS, fill);

const T0 = 1_700_000_000_000;

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

  it('단일 chunk가 자기 시각과 함께 round-trip 된다', async () => {
    const chunk = pcm(100);
    await repo.append('abc12xyz', 's1', chunk, T0);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('s1');
    expect(result[0].runs).toHaveLength(1);
    expect(result[0].runs[0].startedAtMs).toBe(T0);
    expect(result[0].runs[0].pcm.equals(chunk)).toBe(true);
  });

  it('UTF-8 비호환 binary chunk도 그대로 round-trip 된다', async () => {
    const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x10, 0xab]);
    await repo.append('abc12xyz', 's1', binary, T0);
    const result = await repo.consume('abc12xyz');
    expect(result[0].runs[0].pcm.equals(binary)).toBe(true);
  });

  it('서로 다른 participant는 별도 entry로 분리된다', async () => {
    await repo.append('abc12xyz', 's1', pcm(10), T0);
    await repo.append('abc12xyz', 's2', pcm(10), T0);
    const result = await repo.consume('abc12xyz');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.participantId).sort()).toEqual(['s1', 's2']);
  });

  it('consume 후 같은 code로 다시 consume 하면 빈 배열(즉시 폐기)', async () => {
    await repo.append('abc12xyz', 's1', pcm(10), T0);
    await repo.consume('abc12xyz');
    expect(await repo.consume('abc12xyz')).toEqual([]);
  });

  describe('run 분할', () => {
    it('시간이 이어지는 chunk들은 하나의 run으로 합쳐진다', async () => {
      await repo.append('abc12xyz', 's1', pcm(100), T0);
      await repo.append('abc12xyz', 's1', pcm(100), T0 + 100);
      await repo.append('abc12xyz', 's1', pcm(100), T0 + 200);
      const [entry] = await repo.consume('abc12xyz');
      expect(entry.runs).toHaveLength(1);
      expect(entry.runs[0].startedAtMs).toBe(T0);
      expect(entry.runs[0].pcm.length).toBe(300 * BYTES_PER_MS);
    });

    it('시간이 끊기면 별도 run으로 갈린다 — 그 사이 무음은 저장하지 않는다', async () => {
      await repo.append('abc12xyz', 's1', pcm(100), T0);
      // 10초 mute 후 재개.
      await repo.append('abc12xyz', 's1', pcm(100), T0 + 10_100);

      const [entry] = await repo.consume('abc12xyz');
      expect(entry.runs).toHaveLength(2);
      expect(entry.runs[0].startedAtMs).toBe(T0);
      expect(entry.runs[1].startedAtMs).toBe(T0 + 10_100);
      // 실제 오디오 200ms 만 저장된다. 공백 10초는 byte 로 남지 않는다.
      const stored = entry.runs.reduce((sum, run) => sum + run.pcm.length, 0);
      expect(stored).toBe(200 * BYTES_PER_MS);
    });

    it('장시간 mute 여도 저장량은 실제 발화 길이에만 비례한다', async () => {
      await repo.append('abc12xyz', 's1', pcm(50), T0);
      await repo.append('abc12xyz', 's1', pcm(50), T0 + 600_000); // 10분 뒤
      const [entry] = await repo.consume('abc12xyz');
      const stored = entry.runs.reduce((sum, run) => sum + run.pcm.length, 0);
      expect(stored).toBe(100 * BYTES_PER_MS);
      expect(entry.runs[1].startedAtMs).toBe(T0 + 600_000);
    });
  });

  describe('drainAvailable', () => {
    const KEEP_LAST = 1_000 * BYTES_PER_MS; // 1초 overlap

    it('누적된 chunk가 없으면 빈 배열', async () => {
      expect(await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST)).toEqual([]);
    });

    it('마지막 run의 꼬리 keepLastBytes는 남긴다', async () => {
      await repo.append('abc12xyz', 's1', pcm(3_000), T0);
      const runs = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(runs).toHaveLength(1);
      expect(runs[0].startedAtMs).toBe(T0);
      expect(runs[0].pcm.length).toBe(2_000 * BYTES_PER_MS);
    });

    it('남긴 overlap은 다음 drain에서 이어진 시각으로 나온다', async () => {
      await repo.append('abc12xyz', 's1', pcm(3_000), T0);
      await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      await repo.append('abc12xyz', 's1', pcm(3_000), T0 + 3_000);

      const runs = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(runs).toHaveLength(1);
      // 앞 drain 이 2000ms 까지 가져갔으므로 남은 overlap 은 T0+2000 부터다.
      expect(runs[0].startedAtMs).toBe(T0 + 2_000);
      expect(runs[0].pcm.length).toBe(3_000 * BYTES_PER_MS);
    });

    it('끊긴 run은 뒤와 이어지지 않으므로 통째로 나가고, 마지막 run만 overlap을 남긴다', async () => {
      await repo.append('abc12xyz', 's1', pcm(500), T0);
      await repo.append('abc12xyz', 's1', pcm(3_000), T0 + 10_000);

      const runs = await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      expect(runs).toHaveLength(2);
      expect(runs[0].startedAtMs).toBe(T0);
      expect(runs[0].pcm.length).toBe(500 * BYTES_PER_MS);
      expect(runs[1].startedAtMs).toBe(T0 + 10_000);
      expect(runs[1].pcm.length).toBe(2_000 * BYTES_PER_MS);
    });

    it('마지막 run이 keepLastBytes 이하면 그 run은 통째로 남긴다', async () => {
      await repo.append('abc12xyz', 's1', pcm(500), T0);
      expect(await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST)).toEqual([]);
      const [entry] = await repo.consume('abc12xyz');
      expect(entry.runs[0].pcm.length).toBe(500 * BYTES_PER_MS);
    });

    it('drain 후 consume은 남은 overlap만 이어진 시각으로 돌려준다', async () => {
      await repo.append('abc12xyz', 's1', pcm(3_000), T0);
      await repo.drainAvailable('abc12xyz', 's1', KEEP_LAST);
      const [entry] = await repo.consume('abc12xyz');
      expect(entry.runs).toHaveLength(1);
      expect(entry.runs[0].startedAtMs).toBe(T0 + 2_000);
      expect(entry.runs[0].pcm.length).toBe(KEEP_LAST);
    });
  });

  describe('listActiveMeetings / listActiveParticipants', () => {
    it('append 한 적 없으면 빈 배열', async () => {
      expect(await repo.listActiveMeetings()).toEqual([]);
      expect(await repo.listActiveParticipants('abc12xyz')).toEqual([]);
    });

    it('keyPrefix 가 걸려 있어도 회의를 찾는다', async () => {
      // ioredis 는 SCAN 의 MATCH 패턴에는 keyPrefix 를 붙이지 않는다. 패턴에 직접
      // 넣지 않으면 실제 키(`convene:audio-buffer:meeting:*`)와 영영 안 맞아
      // partial 스케줄러가 아무 회의도 찾지 못한다.
      const prefixed = new RedisMock({ keyPrefix: 'convene:' }) as unknown as Redis;
      const prefixedRepo = new RedisAudioBufferRepository(prefixed);
      await prefixedRepo.append('aaa11aaa', 's1', pcm(10), T0);

      expect(await prefixedRepo.listActiveMeetings()).toEqual(['aaa11aaa']);
      expect(await prefixedRepo.listActiveParticipants('aaa11aaa')).toEqual(['s1']);
      await prefixed.quit();
    });

    it('append 한 회의 코드와 participant가 enumerate 된다', async () => {
      await repo.append('aaa11aaa', 's1', pcm(10), T0);
      await repo.append('aaa11aaa', 's2', pcm(10), T0);
      await repo.append('bbb22bbb', 's3', pcm(10), T0);
      expect((await repo.listActiveMeetings()).sort()).toEqual(['aaa11aaa', 'bbb22bbb']);
      expect((await repo.listActiveParticipants('aaa11aaa')).sort()).toEqual(['s1', 's2']);
    });
  });
});
