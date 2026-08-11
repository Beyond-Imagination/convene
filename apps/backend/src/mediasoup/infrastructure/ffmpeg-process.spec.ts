import {
  buildSdp,
  PAD_THRESHOLD_BYTES,
  shouldRespawnFfmpeg,
  silencePaddingBytes,
} from './ffmpeg-process';

describe('buildSdp', () => {
  it('mediasoup가 협상한 payload type·clock rate·channel을 그대로 옮긴다', () => {
    const sdp = buildSdp(50000, 100, 48000, 2);
    expect(sdp).toContain('m=audio 50000 RTP/AVP 100');
    expect(sdp).toContain('a=rtpmap:100 opus/48000/2');
  });
});

describe('silencePaddingBytes', () => {
  // 16kHz mono pcm_s16le = 32000 byte/s.
  const ONE_SECOND = 32_000;

  it('벽시계만큼 이미 기록됐으면 패딩하지 않는다', () => {
    expect(
      silencePaddingBytes({ elapsedMs: 1_000, writtenBytes: ONE_SECOND, incomingBytes: 0 }),
    ).toBe(0);
  });

  it('DTX로 출력이 멈춘 만큼을 무음으로 채운다', () => {
    // 10초 경과했는데 3초치만 기록됨 → 7초치 부족.
    expect(
      silencePaddingBytes({ elapsedMs: 10_000, writtenBytes: ONE_SECOND * 3, incomingBytes: 0 }),
    ).toBe(ONE_SECOND * 7);
  });

  it('지금 들어온 chunk는 부족분에서 제외한다 — chunk 자신이 그 구간을 채운다', () => {
    expect(
      silencePaddingBytes({
        elapsedMs: 10_000,
        writtenBytes: ONE_SECOND * 3,
        incomingBytes: ONE_SECOND * 2,
      }),
    ).toBe(ONE_SECOND * 5);
  });

  it('임계치 이하의 부족분은 무시한다 — 정상 jitter까지 패딩하면 오히려 틀어진다', () => {
    const belowThreshold = PAD_THRESHOLD_BYTES - 1;
    expect(
      silencePaddingBytes({ elapsedMs: 1_000, writtenBytes: ONE_SECOND - belowThreshold, incomingBytes: 0 }),
    ).toBe(0);
  });

  it('기록량이 벽시계를 앞서도 음수를 돌려주지 않는다', () => {
    expect(
      silencePaddingBytes({ elapsedMs: 1_000, writtenBytes: ONE_SECOND * 3, incomingBytes: 0 }),
    ).toBe(0);
  });

  it('패딩은 sample 경계(2 byte)에 맞춘다 — 홀수 byte는 좌우 채널이 밀린다', () => {
    const padding = silencePaddingBytes({
      elapsedMs: 1_001,
      writtenBytes: 0,
      incomingBytes: 0,
    });
    expect(padding % 2).toBe(0);
  });
});

describe('shouldRespawnFfmpeg', () => {
  it('충분히 살아 있었다면 재시작한다 — RTP idle 타임아웃으로 죽은 정상 케이스', () => {
    expect(shouldRespawnFfmpeg({ consecutiveFailures: 0, lifetimeMs: 30_000 })).toBe(true);
  });

  it('오래 살아 있었으면 이전 연속 실패 기록과 무관하게 재시작한다', () => {
    expect(shouldRespawnFfmpeg({ consecutiveFailures: 5, lifetimeMs: 30_000 })).toBe(true);
  });

  it('즉시 죽는 상황이 반복되면 포기한다 — 무한 spawn 루프를 만들지 않는다', () => {
    expect(shouldRespawnFfmpeg({ consecutiveFailures: 5, lifetimeMs: 100 })).toBe(false);
  });

  it('즉시 죽어도 몇 번은 재시도한다 — 포트 바인딩 경합 등 일시적 실패가 있다', () => {
    expect(shouldRespawnFfmpeg({ consecutiveFailures: 1, lifetimeMs: 100 })).toBe(true);
  });
});
