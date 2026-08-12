import {
  BATCH_SILENCE_BUDGET_MS,
  BATCH_SPEECH_BUDGET_MS,
  DEFAULT_CHUNK_MS,
  DEFAULT_OVERLAP_MS,
  dropOverlapHeadSegments,
  isSilentPcm,
  packRunsIntoBatches,
  PCM_BYTES_PER_SECOND,
  splitPcmIntoWavChunks,
  WAV_HEADER_BYTES,
  wrapPcmAsWav,
} from './audio-chunker';

const SECOND = PCM_BYTES_PER_SECOND;

/** Whisper 인코더가 한 번에 보는 창. */
const WHISPER_WINDOW_MS = 30_000;

// chunk 길이는 바뀔 수 있는 값이라 스펙이 숫자를 따로 들지 않는다.
const CHUNK_SECONDS = DEFAULT_CHUNK_MS / 1000;
const OVERLAP_SECONDS = DEFAULT_OVERLAP_MS / 1000;
const STEP_SECONDS = CHUNK_SECONDS - OVERLAP_SECONDS;

const makePcm = (seconds: number): Buffer => {
  const buf = Buffer.alloc(seconds * SECOND);
  // 각 byte에 패턴을 채워 round-trip 검증을 쉽게 한다.
  for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
  return buf;
};

describe('wrapPcmAsWav', () => {
  it('RIFF/WAVE/fmt/data 매직 + 44 byte header를 prepend 한다', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const wav = wrapPcmAsWav(pcm);
    expect(wav.length).toBe(WAV_HEADER_BYTES + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    // PCM body가 header 뒤에 그대로 보존된다.
    expect(wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('fmt chunk가 16kHz mono pcm_s16le를 가리킨다', () => {
    const wav = wrapPcmAsWav(Buffer.alloc(8));
    // audioFormat=1(PCM), numChannels=1, sampleRate=16000, bitsPerSample=16
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(28)).toBe(32000); // byteRate
    expect(wav.readUInt16LE(32)).toBe(2); // blockAlign
    expect(wav.readUInt16LE(34)).toBe(16); // bitsPerSample
  });

  it('RIFF chunkSize와 data subchunkSize가 pcm 길이에 맞춰 채워진다', () => {
    const pcm = Buffer.alloc(100);
    const wav = wrapPcmAsWav(pcm);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunkSize = 36 + dataSize
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data subchunk2Size
  });
});

describe('splitPcmIntoWavChunks', () => {
  it('빈 PCM은 빈 배열', () => {
    expect(splitPcmIntoWavChunks(Buffer.alloc(0))).toEqual([]);
  });

  it('chunkMs 미만 짧은 PCM은 단일 chunk, startMs=0', () => {
    const pcm = makePcm(5);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBe(0);
    // wav body가 원본 PCM 그대로
    expect(chunks[0].wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('정확히 chunkMs 길이 PCM은 단일 chunk, startMs=0', () => {
    const pcm = makePcm(CHUNK_SECONDS);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBe(0);
  });

  it('기본 chunk 는 Whisper 창 하나보다 길다 — 창을 걸쳐야 경계에서 잘리는 발화가 줄어든다', () => {
    expect(DEFAULT_CHUNK_MS).toBeGreaterThan(WHISPER_WINDOW_MS);
  });

  it('chunk size + step size 길이 PCM → 2 chunks가 (chunkMs - overlapMs) step으로 정렬된다', () => {
    // 총 step + chunk 길이 PCM 이면 chunk0=[0..chunk], chunk1=[step..step+chunk].
    const pcm = makePcm(STEP_SECONDS + CHUNK_SECONDS);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].startMs).toBe(0);
    expect(chunks[1].startMs).toBe(DEFAULT_CHUNK_MS - DEFAULT_OVERLAP_MS);
    // 각 chunk wav body가 PCM의 해당 구간과 일치
    expect(
      chunks[0].wav.subarray(WAV_HEADER_BYTES, WAV_HEADER_BYTES + CHUNK_SECONDS * SECOND),
    ).toEqual(pcm.subarray(0, CHUNK_SECONDS * SECOND));
    expect(chunks[1].wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm.subarray(STEP_SECONDS * SECOND));
  });

  it('overlap 구간 PCM이 인접 chunk 양쪽에 모두 포함된다', () => {
    const pcm = makePcm(STEP_SECONDS + CHUNK_SECONDS);
    const chunks = splitPcmIntoWavChunks(pcm);
    // chunk0의 마지막 overlap 구간 = chunk1의 첫 overlap 구간
    const chunk0Tail = chunks[0].wav.subarray(
      WAV_HEADER_BYTES + STEP_SECONDS * SECOND,
      WAV_HEADER_BYTES + CHUNK_SECONDS * SECOND,
    );
    const chunk1Head = chunks[1].wav.subarray(
      WAV_HEADER_BYTES,
      WAV_HEADER_BYTES + OVERLAP_SECONDS * SECOND,
    );
    expect(chunk0Tail).toEqual(chunk1Head);
  });

  it('마지막 chunk가 chunkMs보다 짧으면 남은 PCM 끝까지 마지막 chunk로 포함된다', () => {
    // step 을 두 번 지나고 꼬리가 남는 길이 → chunk2 는 step*2 부터 끝까지.
    const TAIL_SECONDS = 14;
    const pcm = makePcm(STEP_SECONDS * 2 + TAIL_SECONDS);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].startMs).toBe(STEP_SECONDS * 2 * 1000);
    expect(chunks[2].wav.subarray(WAV_HEADER_BYTES).length).toBe(TAIL_SECONDS * SECOND);
  });

  it('option으로 chunkMs/overlapMs를 override 할 수 있다', () => {
    const pcm = makePcm(10);
    // chunk=5s, overlap=1s → step=4s. 10s 라면 chunk0=[0..5], chunk1=[4..9], chunk2=[8..10]
    const chunks = splitPcmIntoWavChunks(pcm, { chunkMs: 5_000, overlapMs: 1_000 });
    expect(chunks.map((c) => c.startMs)).toEqual([0, 4_000, 8_000]);
  });

  it('overlapMs=0 이면 step=chunkMs (chunk가 정확히 이어붙는다)', () => {
    const pcm = makePcm(90);
    const chunks = splitPcmIntoWavChunks(pcm, { chunkMs: 30_000, overlapMs: 0 });
    expect(chunks.map((c) => c.startMs)).toEqual([0, 30_000, 60_000]);
  });
});

describe('dropOverlapHeadSegments', () => {
  const seg = (startMs: number, text = '') => ({ startMs, endMs: startMs + 100, text });

  it('isFirstChunk=true 면 그대로 보존', () => {
    const input = [seg(0), seg(500), seg(2500)];
    expect(dropOverlapHeadSegments(input, true)).toEqual(input);
  });

  it('isFirstChunk=false 면 startMs < overlapMs인 segment를 skip', () => {
    const input = [seg(0), seg(500), seg(2500), seg(5000)];
    expect(dropOverlapHeadSegments(input, false)).toEqual([seg(2500), seg(5000)]);
  });

  it('overlapMs를 override 할 수 있다', () => {
    const input = [seg(0), seg(900), seg(1500)];
    expect(dropOverlapHeadSegments(input, false, 1_000)).toEqual([seg(1500)]);
  });

  it('default overlapMs는 2000ms', () => {
    expect(DEFAULT_OVERLAP_MS).toBe(2_000);
    const input = [seg(1_999), seg(2_000), seg(2_001)];
    expect(dropOverlapHeadSegments(input, false)).toEqual([seg(2_000), seg(2_001)]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(dropOverlapHeadSegments([], false)).toEqual([]);
    expect(dropOverlapHeadSegments([], true)).toEqual([]);
  });
});

describe('packRunsIntoBatches', () => {
  const BYTES_PER_MS = 32;
  const run = (ms: number, startedAtMs: number) => ({
    pcm: Buffer.alloc(ms * BYTES_PER_MS, 1),
    startedAtMs,
  });

  it('시간이 가까운 run 들을 실제 간격만큼 무음을 끼워 이어 붙인다', () => {
    // run A 0~1000ms, 500ms 쉬고, run B 1500~2500ms.
    const batches = packRunsIntoBatches([run(1_000, 0), run(1_000, 1_500)]);
    expect(batches).toHaveLength(1);
    expect(batches[0].startedAtMs).toBe(0);
    // 배치 길이 = 실제 경과 시간(2500ms)과 같아야 한다.
    expect(batches[0].pcm.length).toBe(2_500 * BYTES_PER_MS);
  });

  it('배치가 실제 시간축을 재현하므로 오프셋을 그대로 더하면 절대 시각이 된다', () => {
    const batches = packRunsIntoBatches([run(1_000, 10_000), run(1_000, 11_500)]);
    // 두 번째 run 의 첫 sample 은 배치 안 1500ms 지점 = 10_000 + 1500.
    const offsetOfSecond = 1_500 * BYTES_PER_MS;
    expect(batches[0].pcm.length).toBe(2_500 * BYTES_PER_MS);
    expect(batches[0].startedAtMs + 1_500).toBe(11_500);
    expect(offsetOfSecond).toBeGreaterThan(0);
  });

  it('간격이 멀면 배치를 나눈다 — 무음으로 채우면 예산만 먹는다', () => {
    const batches = packRunsIntoBatches([run(1_000, 0), run(1_000, 600_000)]);
    expect(batches).toHaveLength(2);
    expect(batches[0].startedAtMs).toBe(0);
    expect(batches[1].startedAtMs).toBe(600_000);
  });

  it('짧은 발화가 띄엄띄엄 와도 배치가 무음으로 채워지지 않는다', () => {
    // 0.1초 발화 × 10개, 매번 4초 간격. 무음 예산이 없으면 40초 무음 + 1초 발화가 된다.
    const runs = Array.from({ length: 10 }, (_, i) => run(100, i * 4_100));
    const batches = packRunsIntoBatches(runs);

    for (const batch of batches) {
      const totalMs = batch.pcm.length / BYTES_PER_MS;
      const speechMs = runs
        .filter(
          (r) => r.startedAtMs >= batch.startedAtMs && r.startedAtMs < batch.startedAtMs + totalMs,
        )
        .reduce((sum, r) => sum + r.pcm.length / BYTES_PER_MS, 0);
      expect(totalMs - speechMs).toBeLessThanOrEqual(BATCH_SILENCE_BUDGET_MS);
    }
  });

  it('배치는 Whisper 창 하나에 맞추지 않는다 — 창을 걸쳐야 경계에서 잘리는 발화가 줄어든다', () => {
    const batches = packRunsIntoBatches([
      run(WHISPER_WINDOW_MS, 0),
      run(WHISPER_WINDOW_MS, WHISPER_WINDOW_MS + 500),
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].pcm.length / BYTES_PER_MS).toBeGreaterThan(WHISPER_WINDOW_MS * 2);
  });

  it('발화가 예산을 채우면 무음 예산이 남아도 배치를 나눈다', () => {
    const overHalf = Math.ceil(BATCH_SPEECH_BUDGET_MS * 0.6);
    const batches = packRunsIntoBatches([run(overHalf, 0), run(overHalf, overHalf + 500)]);
    expect(batches).toHaveLength(2);
  });

  it('예산을 넘으면 다음 배치로 넘긴다', () => {
    const overHalf = Math.ceil(BATCH_SPEECH_BUDGET_MS * 0.6);
    const batches = packRunsIntoBatches([run(overHalf, 0), run(overHalf, overHalf + 1_000)]);
    expect(batches).toHaveLength(2);
  });

  it('예산보다 긴 run 하나는 그대로 자기 배치가 된다', () => {
    const longer = BATCH_SPEECH_BUDGET_MS + 10_000;
    const batches = packRunsIntoBatches([run(longer, 0)]);
    expect(batches).toHaveLength(1);
    expect(batches[0].pcm.length).toBe(longer * BYTES_PER_MS);
  });

  it('빈 입력은 빈 배열', () => {
    expect(packRunsIntoBatches([])).toEqual([]);
  });
});

describe('isSilentPcm', () => {
  const sample = (value: number, count: number): Buffer => {
    const buf = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) buf.writeInt16LE(value, i * 2);
    return buf;
  };

  it('전부 0이면 무음', () => {
    expect(isSilentPcm(Buffer.alloc(32_000))).toBe(true);
  });

  it('빈 버퍼도 무음', () => {
    expect(isSilentPcm(Buffer.alloc(0))).toBe(true);
  });

  it('임계치 아래 잔잔한 잡음은 무음으로 본다', () => {
    expect(isSilentPcm(sample(100, 16_000))).toBe(true);
  });

  it('말소리 수준의 진폭은 무음이 아니다', () => {
    expect(isSilentPcm(sample(4_000, 16_000))).toBe(false);
  });

  it('대부분 무음이라도 발화가 섞여 있으면 무음이 아니다', () => {
    const quiet = sample(50, 15_000);
    const loud = sample(6_000, 1_000);
    expect(isSilentPcm(Buffer.concat([quiet, loud]))).toBe(false);
  });
});
