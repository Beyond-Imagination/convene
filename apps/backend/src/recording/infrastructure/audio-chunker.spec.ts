import {
  DEFAULT_OVERLAP_MS,
  dropOverlapHeadSegments,
  PCM_BYTES_PER_SECOND,
  splitPcmIntoWavChunks,
  WAV_HEADER_BYTES,
  wrapPcmAsWav,
} from './audio-chunker';

const SECOND = PCM_BYTES_PER_SECOND;

const makePcm = (seconds: number): Buffer => {
  const buf = Buffer.alloc(seconds * SECOND);
  // 각 byte 에 패턴을 채워 round-trip 검증을 쉽게 한다.
  for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
  return buf;
};

describe('wrapPcmAsWav', () => {
  it('RIFF/WAVE/fmt/data 매직 + 44 byte header 를 prepend 한다', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const wav = wrapPcmAsWav(pcm);
    expect(wav.length).toBe(WAV_HEADER_BYTES + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    // PCM body 가 header 뒤에 그대로 보존된다.
    expect(wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('fmt chunk 가 16kHz mono pcm_s16le 를 가리킨다', () => {
    const wav = wrapPcmAsWav(Buffer.alloc(8));
    // audioFormat=1(PCM), numChannels=1, sampleRate=16000, bitsPerSample=16
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt32LE(28)).toBe(32000); // byteRate
    expect(wav.readUInt16LE(32)).toBe(2); // blockAlign
    expect(wav.readUInt16LE(34)).toBe(16); // bitsPerSample
  });

  it('RIFF chunkSize 와 data subchunkSize 가 pcm 길이에 맞춰 채워진다', () => {
    const pcm = Buffer.alloc(100);
    const wav = wrapPcmAsWav(pcm);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunkSize = 36 + dataSize
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data subchunk2Size
  });
});

describe('splitPcmIntoWavChunks', () => {
  it('빈 PCM 은 빈 배열', () => {
    expect(splitPcmIntoWavChunks(Buffer.alloc(0))).toEqual([]);
  });

  it('chunkMs 미만 짧은 PCM 은 단일 chunk, startMs=0', () => {
    const pcm = makePcm(5);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBe(0);
    // wav body 가 원본 PCM 그대로
    expect(chunks[0].wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm);
  });

  it('정확히 chunkMs 길이 PCM 은 단일 chunk, startMs=0', () => {
    const pcm = makePcm(30);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBe(0);
  });

  it('chunk size + step size 길이 PCM → 2 chunks 가 (chunkMs - overlapMs) step 으로 정렬된다', () => {
    // 30s chunk + 28s step → 2번째 chunk 가 28s 부터 시작해 58s 까지 30s 길이.
    // step + chunk = 28 + 30 = 58s. 총 58s PCM 이면 chunk0=[0..30], chunk1=[28..58].
    const pcm = makePcm(58);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].startMs).toBe(0);
    expect(chunks[1].startMs).toBe(28_000);
    // 각 chunk wav body 가 PCM 의 해당 구간과 일치
    expect(chunks[0].wav.subarray(WAV_HEADER_BYTES, WAV_HEADER_BYTES + 30 * SECOND)).toEqual(
      pcm.subarray(0, 30 * SECOND),
    );
    expect(chunks[1].wav.subarray(WAV_HEADER_BYTES)).toEqual(pcm.subarray(28 * SECOND));
  });

  it('overlap 구간 PCM 이 인접 chunk 양쪽에 모두 포함된다', () => {
    const pcm = makePcm(58);
    const chunks = splitPcmIntoWavChunks(pcm);
    // chunk0 의 마지막 2초 = chunk1 의 첫 2초
    const chunk0Tail = chunks[0].wav.subarray(
      WAV_HEADER_BYTES + 28 * SECOND,
      WAV_HEADER_BYTES + 30 * SECOND,
    );
    const chunk1Head = chunks[1].wav.subarray(WAV_HEADER_BYTES, WAV_HEADER_BYTES + 2 * SECOND);
    expect(chunk0Tail).toEqual(chunk1Head);
  });

  it('마지막 chunk 가 chunkMs 보다 짧으면 남은 PCM 끝까지 마지막 chunk 로 포함된다', () => {
    // 70s PCM, chunk=30s, step=28s
    // chunk0=[0..30], chunk1=[28..58], chunk2=[56..70] (14s)
    const pcm = makePcm(70);
    const chunks = splitPcmIntoWavChunks(pcm);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].startMs).toBe(56_000);
    expect(chunks[2].wav.subarray(WAV_HEADER_BYTES).length).toBe(14 * SECOND);
  });

  it('option 으로 chunkMs/overlapMs 를 override 할 수 있다', () => {
    const pcm = makePcm(10);
    // chunk=5s, overlap=1s → step=4s. 10s 라면 chunk0=[0..5], chunk1=[4..9], chunk2=[8..10]
    const chunks = splitPcmIntoWavChunks(pcm, { chunkMs: 5_000, overlapMs: 1_000 });
    expect(chunks.map((c) => c.startMs)).toEqual([0, 4_000, 8_000]);
  });

  it('overlapMs=0 이면 step=chunkMs (chunk 가 정확히 이어붙는다)', () => {
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

  it('isFirstChunk=false 면 startMs < overlapMs 인 segment 를 skip', () => {
    const input = [seg(0), seg(500), seg(2500), seg(5000)];
    expect(dropOverlapHeadSegments(input, false)).toEqual([seg(2500), seg(5000)]);
  });

  it('overlapMs 를 override 할 수 있다', () => {
    const input = [seg(0), seg(900), seg(1500)];
    expect(dropOverlapHeadSegments(input, false, 1_000)).toEqual([seg(1500)]);
  });

  it('default overlapMs 는 2000ms', () => {
    expect(DEFAULT_OVERLAP_MS).toBe(2_000);
    const input = [seg(1_999), seg(2_000), seg(2_001)];
    expect(dropOverlapHeadSegments(input, false)).toEqual([seg(2_000), seg(2_001)]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(dropOverlapHeadSegments([], false)).toEqual([]);
    expect(dropOverlapHeadSegments([], true)).toEqual([]);
  });
});
