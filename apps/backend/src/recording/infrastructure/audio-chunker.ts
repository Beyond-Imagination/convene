/**
 * raw PCM(16kHz mono pcm_s16le) buffer를 `chunkMs` 단위로 split 한다.
 *
 * 회의 종료 후 누적 audio를 한 번에 ai-worker로 보내지 않고, 본 헬퍼로 잘라 N 번 호출한다.
 * chunk 경계의 단어 잘림을 줄이기 위해 인접 chunk 사이에 `overlapMs` 만큼 겹친다.
 * 각 chunk의 `startMs`는 raw PCM 시간축 기준이고, STT 결과 segment.startMs/endMs에 합산한다.
 *
 * 각 chunk는 ai-worker가 그대로 디코드 할 수 있도록 RIFF WAVE header(44 byte)를 prepend 한 형태로 돌려준다.
 * ffmpeg 출력 포맷이 `-f s16le` (raw PCM)인 것을 전제로 한다.
 */

export const PCM_SAMPLE_RATE = 16_000;
export const PCM_CHANNELS = 1;
export const PCM_BITS_PER_SAMPLE = 16;
export const PCM_BYTES_PER_SAMPLE = PCM_BITS_PER_SAMPLE / 8;
export const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_BYTES_PER_SAMPLE;

export const WAV_HEADER_BYTES = 44;

/**
 * Whisper 는 30초 창 단위로 디코드하는데, 창 하나에 딱 맞춰 보내면 발화가 창 끝에서 잘린 채
 * 문맥 없이 디코드된다. 창을 여러 개 걸치도록 길게 보내면 그 경계 손실이 줄어든다.
 * 더 늘려도 이득이 없어 90초에서 멈춘다.
 */
export const DEFAULT_CHUNK_MS = 90_000;
export const DEFAULT_OVERLAP_MS = 2_000;

export interface PcmChunk {
  /** RIFF WAVE header + PCM body. ai-worker가 그대로 디코드 가능. */
  readonly wav: Buffer;
  /** 본 chunk 첫 sample의 시간축 위치(ms). raw PCM 첫 sample = 0. */
  readonly startMs: number;
}

export interface ChunkOptions {
  readonly chunkMs?: number;
  readonly overlapMs?: number;
}

export function wrapPcmAsWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  // RIFF chunk
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4); // chunkSize = 36 + dataSize
  header.write('WAVE', 8, 'ascii');
  // fmt subchunk
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // subchunk1Size = 16 (PCM)
  header.writeUInt16LE(1, 20); // audioFormat = 1 (PCM)
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28); // byteRate
  header.writeUInt16LE(PCM_CHANNELS * PCM_BYTES_PER_SAMPLE, 32); // blockAlign
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
  // data subchunk
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40); // subchunk2Size
  return Buffer.concat([header, pcm], WAV_HEADER_BYTES + pcm.length);
}

export function splitPcmIntoWavChunks(pcm: Buffer, options: ChunkOptions = {}): PcmChunk[] {
  if (pcm.length === 0) return [];
  const chunkMs = options.chunkMs ?? DEFAULT_CHUNK_MS;
  const overlapMs = options.overlapMs ?? DEFAULT_OVERLAP_MS;
  if (overlapMs >= chunkMs) {
    throw new Error(`overlapMs (${overlapMs}) must be smaller than chunkMs (${chunkMs}).`);
  }

  const chunkBytes = msToBytes(chunkMs);
  const stepBytes = msToBytes(chunkMs - overlapMs);

  const chunks: PcmChunk[] = [];
  let cursor = 0;
  while (cursor < pcm.length) {
    const end = Math.min(cursor + chunkBytes, pcm.length);
    const slice = pcm.subarray(cursor, end);
    chunks.push({
      wav: wrapPcmAsWav(slice),
      startMs: bytesToMs(cursor),
    });
    if (end >= pcm.length) break;
    cursor += stepBytes;
  }
  return chunks;
}

function msToBytes(ms: number): number {
  return Math.floor((ms / 1000) * PCM_BYTES_PER_SECOND);
}

function bytesToMs(bytes: number): number {
  return Math.floor((bytes / PCM_BYTES_PER_SECOND) * 1000);
}

interface HasStartMs {
  readonly startMs: number;
}

/**
 * chunk 경계 dedup — chunk N+1의 첫 `overlapMs` 구간 안에 시작하는 segment 들은 chunk N의 마지막에서도 잡혔다고 가정해 skip 한다.
 * 첫 chunk(`isFirstChunk=true`)는 그 이전 chunk가 없으므로 그대로 보존한다.
 *
 * 입력 segment의 `startMs`는 chunk-local 시각(transcribe 직접 반환).
 * 호출자가 이후 chunk offset / participant offset 등을 가산한다.
 */
export function dropOverlapHeadSegments<T extends HasStartMs>(
  segments: ReadonlyArray<T>,
  isFirstChunk: boolean,
  overlapMs: number = DEFAULT_OVERLAP_MS,
): T[] {
  if (isFirstChunk) return [...segments];
  return segments.filter((s) => s.startMs >= overlapMs);
}

/**
 * 발화와 무음에 예산을 따로 둬, 무음이 배치를 채워 버리는 것을 막는다.
 * 발화 예산은 `DEFAULT_CHUNK_MS` 와 같은 이유로 Whisper 창보다 크게 잡고,
 * drain 주기(`PARTIAL_INTERVAL_MS`)보다 작아지지 않게 유지한다 — 작으면 한 번 걷은
 * 오디오가 배치로 갈려 창을 걸치는 이득이 사라진다.
 */
export const BATCH_SPEECH_BUDGET_MS = 90_000;
/** 발화 예산이 커진 만큼 그 사이 자연스러운 침묵도 길어진다. 다만 무음 디코드는 낭비라 상한을 둔다. */
export const BATCH_SILENCE_BUDGET_MS = 15_000;

export interface RunBatch {
  readonly pcm: Buffer;
  /** 배치 첫 sample 의 절대 시각(epoch ms). segment 시각은 여기에 오프셋을 더하면 된다. */
  readonly startedAtMs: number;
}

interface TimedRun {
  readonly pcm: Buffer;
  readonly startedAtMs: number;
}

/**
 * 짧은 run 을 예산 안에서 묶는다. Whisper 는 아무리 짧은 입력도 창 하나를 다 돌아서,
 * 잦은 mute 로 갈린 run 을 한 건씩 보내면 연산이 몇 배로 샌다. 반대로 창 여러 개에 걸치도록
 * 크게 묶으면 창 경계에서 잘리는 발화가 줄어 품질까지 같이 오른다.
 * run 사이는 실제 경과 시간만큼 무음으로 메워, 배치 안 오프셋이 곧 실제 경과가 되게 한다.
 */
export function packRunsIntoBatches(runs: ReadonlyArray<TimedRun>): RunBatch[] {
  const batches: RunBatch[] = [];
  let parts: Buffer[] = [];
  let batchStartMs = 0;
  let nextOffsetMs = 0;
  let speechMs = 0;
  let silenceMs = 0;

  const flush = (): void => {
    if (parts.length === 0) return;
    batches.push({ pcm: Buffer.concat(parts), startedAtMs: batchStartMs });
    parts = [];
    nextOffsetMs = 0;
    speechMs = 0;
    silenceMs = 0;
  };

  for (const run of runs) {
    const durationMs = bytesToMs(run.pcm.length);
    const gapMs = parts.length === 0 ? 0 : run.startedAtMs - (batchStartMs + nextOffsetMs);
    if (
      parts.length > 0 &&
      (speechMs + durationMs > BATCH_SPEECH_BUDGET_MS ||
        silenceMs + gapMs > BATCH_SILENCE_BUDGET_MS)
    ) {
      flush();
    }
    if (parts.length === 0) {
      batchStartMs = run.startedAtMs;
    } else if (gapMs > 0) {
      parts.push(Buffer.alloc(msToBytes(gapMs)));
      nextOffsetMs += gapMs;
      silenceMs += gapMs;
    }
    parts.push(run.pcm);
    nextOffsetMs += durationMs;
    speechMs += durationMs;
  }
  flush();
  return batches;
}

/** 이 진폭(16bit 기준 약 -36dBFS)을 넘는 sample 이 하나도 없으면 발화가 없다고 본다. */
const SILENCE_PEAK_THRESHOLD = 500;

export function isSilentPcm(pcm: Buffer): boolean {
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    if (Math.abs(pcm.readInt16LE(i)) >= SILENCE_PEAK_THRESHOLD) return false;
  }
  return true;
}
