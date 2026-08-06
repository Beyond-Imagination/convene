export interface AbsoluteTranscriptSegment {
  readonly speaker: string;
  readonly text: string;
  readonly absoluteStartMs: number;
  readonly absoluteEndMs: number;
}

export const PARTIAL_TRANSCRIPT_STORE = Symbol('PARTIAL_TRANSCRIPT_STORE');

/**
 * 실시간 partial 전사의 누적 결과 저장소.
 *
 * 회의 진행 중 N초마다 chunk를 ai-worker로 보내 받은 segments를 본 store에 저장한다.
 */
export interface PartialTranscriptStore {
  append(meetingCode: string, segments: ReadonlyArray<AbsoluteTranscriptSegment>): Promise<void>;

  /**
   * 회의의 누적 segments를 모두 돌려주고 즉시 폐기한다. 누적이 없으면 `[]`.
   */
  consume(meetingCode: string): Promise<ReadonlyArray<AbsoluteTranscriptSegment>>;
}
