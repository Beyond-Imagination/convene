import { ChatEntry, ReportSummary } from '@/shared-kernel/domain/value-objects';

import { TranscriptSegment } from '../entries';

/**
 * LLM 기반 회의록 요약 어댑터의 도메인 포트.
 */
export interface SummarizerPort {
  summarize(input: SummarizerInput): Promise<ReportSummary>;
}

/**
 * LLM 입력 묶음.
 * 회의 메타데이터(`meta`)는 모델 프롬프트에서 제목·날짜 등을 채우는 용도이며, transcript/chat이 비어 있더라도 본 호출 자체는 합법이다.
 */
export interface SummarizerInput {
  readonly transcript: ReadonlyArray<TranscriptSegment>;
  readonly chat: ReadonlyArray<ChatEntry>;
  readonly meta: SummarizerMeta;
}

export interface SummarizerMeta {
  readonly meetingId: string;
  readonly code: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
}
