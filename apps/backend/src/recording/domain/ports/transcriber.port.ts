import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

/**
 * STT(Speech-to-Text) 어댑터의 도메인 포트.
 *
 * 구현체는 외부 ai-worker(faster-whisper) HTTP 호출 또는 placeholder Noop 으로
 * 주입된다(PLAN.md §3 / ARCHITECTURE.md §3.2). Application Service 는 본 포트에만
 * 의존하며, 오디오 입력은 `Buffer | null`(빈 회의 fallback) 로 전달한다.
 *
 * 반환은 wire-level `TranscriptionSegmentPayload[]` 로, Reports BC listener 가
 * `transcriptSegment(...)` helper 로 VO 변환한다. 본 인터페이스는 BC 간 cross-import
 * 를 피하기 위해 plain 구조만 노출한다.
 *
 * 실패는 throw 로 표현하며, Application Service 가 catch 해
 * `report.transcription.failed` 이벤트를 발행한다.
 */
export interface TranscriberPort {
  transcribe(input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>>;
}

export interface TranscriberInput {
  readonly meetingCode: string;
  readonly audio: Buffer | null;
}
