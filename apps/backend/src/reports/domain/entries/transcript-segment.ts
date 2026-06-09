/**
 * STT가 발화 구간 단위로 돌려주는 transcript 한 조각.
 *
 * `speaker`는 diarization을 적용하기 전이라 unknown일 수 있어 optional이다.
 * `startMs`/`endMs`는 회의 시작 시점부터의 오프셋. 정렬·구간 검색 용이성을 위해 정수 ms로 강제한다.
 */
export interface TranscriptSegment {
  readonly speaker?: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

const TEXT_MAX = 5000;

export function transcriptSegment(input: {
  speaker?: string;
  text: string;
  startMs: number;
  endMs: number;
}): TranscriptSegment {
  const text = input.text.trim();
  if (text.length === 0 || text.length > TEXT_MAX) {
    throw new Error(`TranscriptSegment.text must be 1~${TEXT_MAX} chars after trim`);
  }
  if (!Number.isFinite(input.startMs) || !Number.isInteger(input.startMs) || input.startMs < 0) {
    throw new Error(
      `TranscriptSegment.startMs must be a non-negative integer, got ${input.startMs}`,
    );
  }
  if (
    !Number.isFinite(input.endMs) ||
    !Number.isInteger(input.endMs) ||
    input.endMs < input.startMs
  ) {
    throw new Error(
      `TranscriptSegment.endMs must be an integer >= startMs(${input.startMs}), got ${input.endMs}`,
    );
  }
  const speaker = input.speaker?.trim();
  if (speaker !== undefined && speaker.length === 0) {
    throw new Error('TranscriptSegment.speaker must be non-empty when provided');
  }
  return speaker === undefined
    ? { text, startMs: input.startMs, endMs: input.endMs }
    : { speaker, text, startMs: input.startMs, endMs: input.endMs };
}
