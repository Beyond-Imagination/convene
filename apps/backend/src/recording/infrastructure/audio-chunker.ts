/**
 * raw PCM(16kHz mono pcm_s16le) buffer를 30초(default) chunk 단위로 split 한다.
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

export const DEFAULT_CHUNK_MS = 30_000;
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
    throw new Error(`overlapMs(${overlapMs})는 chunkMs(${chunkMs})보다 작아야 합니다.`);
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
