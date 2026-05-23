/**
 * `report.transcription.requested` / `completed` / `failed` 도메인 이벤트 payload.
 *
 * Reports BC 가 `requested` 를 발행하고, Recording BC 가 STT 결과에 따라
 * `completed` 또는 `failed` 를 발행한다. Reports BC 의 listener 가 `completed`/`failed`
 * 를 받아 Aggregate(`MeetingReport`)에 transcript 를 적용한다(ARCHITECTURE §2.4 / §5).
 *
 * `transcript` 는 도메인 VO 가 아니라 wire-level plain 구조로 정의해 BC 간 cross-import
 * 를 차단한다. Reports BC listener 가 `transcriptSegment(...)` helper 로 VO 변환한다.
 */

export interface ReportTranscriptionRequestedPayload {
  readonly reportId: string;
  readonly meetingId: string;
  readonly code: string;
  readonly meetingStartedAtMs: number;
}

export interface TranscriptionSegmentPayload {
  readonly speaker?: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface ReportTranscriptionCompletedPayload {
  readonly reportId: string;
  readonly transcript: ReadonlyArray<TranscriptionSegmentPayload>;
}

export interface ReportTranscriptionFailedPayload {
  readonly reportId: string;
  readonly error: string;
}
