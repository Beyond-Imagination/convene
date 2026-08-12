import {
  anchorChunkTime,
  buildSdp,
  isUdpPortBound,
  pcmDurationMs,
  shouldRespawnFfmpeg,
} from './ffmpeg-process';

describe('buildSdp', () => {
  it('mediasoup가 협상한 payload type·clock rate·channel을 그대로 옮긴다', () => {
    const sdp = buildSdp(50000, 100, 48000, 2);
    expect(sdp).toContain('m=audio 50000 RTP/AVP 100');
    expect(sdp).toContain('a=rtpmap:100 opus/48000/2');
  });
});

describe('pcmDurationMs', () => {
  // 16kHz mono pcm_s16le = 32000 byte/s.
  it('byte 수를 재생 길이(ms)로 환산한다', () => {
    expect(pcmDurationMs(32_000)).toBe(1_000);
    expect(pcmDurationMs(16_000)).toBe(500);
    expect(pcmDurationMs(0)).toBe(0);
  });
});

describe('anchorChunkTime', () => {
  const BYTES_PER_MS = 32;
  const T0 = 1_700_000_000_000;

  it('첫 chunk 는 도착 시각에서 재생 길이를 뺀 값으로 앵커를 잡는다', () => {
    const r = anchorChunkTime({ anchor: undefined, arrivalMs: T0 + 100, chunkBytes: 100 * BYTES_PER_MS });
    expect(r.startedAtMs).toBe(T0);
    expect(r.anchor).toEqual({ startedAtMs: T0, bytes: 100 * BYTES_PER_MS });
  });

  it('이후 chunk 는 도착 시각이 아니라 누적 byte 로 시각을 정한다', () => {
    // 도착이 80ms 늦게 찍혀도 앵커 기준으로는 정확히 이어져야 한다.
    const first = anchorChunkTime({ anchor: undefined, arrivalMs: T0 + 100, chunkBytes: 100 * BYTES_PER_MS });
    const second = anchorChunkTime({
      anchor: first.anchor,
      arrivalMs: T0 + 280,
      chunkBytes: 100 * BYTES_PER_MS,
    });
    expect(second.startedAtMs).toBe(T0 + 100);
  });

  it('도착 시각이 흔들려도 run 이 갈리지 않는다 — 파편화의 원인이었다', () => {
    let anchor;
    const starts: number[] = [];
    for (let i = 0; i < 50; i++) {
      // 누적되지 않는 지터(±수십 ms). 이 정도로 run 이 갈리면 안 된다.
      const jitter = i % 3 === 0 ? 80 : i % 3 === 1 ? -40 : 15;
      const r = anchorChunkTime({
        anchor,
        arrivalMs: T0 + (i + 1) * 100 + jitter,
        chunkBytes: 100 * BYTES_PER_MS,
      });
      anchor = r.anchor;
      starts.push(r.startedAtMs);
    }
    // 도착 지터가 시각에 실리지 않는다 — 간격이 정확히 재생 길이(100ms)로 유지된다.
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    expect(new Set(gaps)).toEqual(new Set([100]));
  });

  it('벽시계보다 꾸준히 뒤처지면 앵커를 다시 잡는다 — 오디오가 실제로 모자란 상황', () => {
    let anchor;
    let reanchored = 0;
    let prev = 0;
    for (let i = 0; i < 40; i++) {
      const r = anchorChunkTime({
        anchor,
        arrivalMs: T0 + (i + 1) * 100 + i * 40,
        chunkBytes: 100 * BYTES_PER_MS,
      });
      if (i > 0 && r.anchor.bytes === 100 * BYTES_PER_MS) reanchored += 1;
      anchor = r.anchor;
      prev = r.startedAtMs;
    }
    expect(reanchored).toBeGreaterThan(0);
    expect(prev).toBeGreaterThan(T0);
  });

  it('벽시계와 크게 벌어지면 앵커를 다시 잡는다 — 실제로 오디오가 빈 구간', () => {
    const first = anchorChunkTime({ anchor: undefined, arrivalMs: T0 + 100, chunkBytes: 100 * BYTES_PER_MS });
    const afterGap = anchorChunkTime({
      anchor: first.anchor,
      arrivalMs: T0 + 10_100,
      chunkBytes: 100 * BYTES_PER_MS,
    });
    expect(afterGap.startedAtMs).toBe(T0 + 10_000);
    expect(afterGap.anchor.bytes).toBe(100 * BYTES_PER_MS);
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

describe('isUdpPortBound', () => {
  // /proc/net/udp 의 local_address 는 `주소:포트` 를 대문자 16진수로 적는다.
  const table = [
    '   sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    ' 7187: 0B00007F:CCD7 00000000:0000 07 00000000:00000000 00:00000000 00000000     0        0 837439',
    ' 7190: 00000000:14E9 00000000:0000 07 00000000:00000000 00:00000000 00000000     0        0 837440',
  ].join('\n');

  it('바인딩된 포트를 찾는다', () => {
    expect(isUdpPortBound(table, 0xccd7)).toBe(true);
    expect(isUdpPortBound(table, 0x14e9)).toBe(true);
  });

  it('바인딩되지 않은 포트는 false', () => {
    expect(isUdpPortBound(table, 40_000)).toBe(false);
  });

  it('포트 번호가 다른 컬럼에 우연히 나타나도 오탐하지 않는다', () => {
    // 0x837439 는 inode 컬럼 값이지 포트가 아니다.
    expect(isUdpPortBound(table, 0x8374)).toBe(false);
  });
});
