/**
 * Phase 2 partial transcribe 의 누적 결과 저장소.
 *
 * `PartialTranscriptionScheduler` 가 회의 진행 중 N초마다 chunk 를 ai-worker 로
 * 보내 받은 segments 를 본 store 에 append 한다. 회의 종료 시 `RecordingService`
 * 가 consume 으로 모두 가져오고 마지막 잔여 STT 결과와 merge 해 transcription
 * .completed 이벤트를 발행한다.
 *
 * 시간축은 **절대 epoch ms** 다 — scheduler 가 회의 시작 시각을 모르도록 격리
 * (cross-BC 의존 회피). `RecordingService` 가 회의 종료 시 meetingStartedAtMs
 * 로 정규화한다.
 */
export interface AbsoluteTranscriptSegment {
  readonly speaker: string;
  readonly text: string;
  /** participant.startedAtMs + chunk.startMs + seg.startMs (epoch ms). */
  readonly absoluteStartMs: number;
  readonly absoluteEndMs: number;
}

export interface PartialTranscriptStore {
  append(
    meetingCode: string,
    segments: ReadonlyArray<AbsoluteTranscriptSegment>,
  ): Promise<void>;

  /**
   * 회의의 누적 segments 를 모두 돌려주고 즉시 폐기한다. 누적이 없으면 `[]`.
   */
  consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<AbsoluteTranscriptSegment>>;
}
