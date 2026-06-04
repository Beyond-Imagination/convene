import { ChatEntry } from '@/shared-kernel/domain/value-objects';

import { TranscriptSegment } from '../entries';
import { ReportSummary } from '../value-objects';

/**
 * LLM 기반 회의록 요약 어댑터의 도메인 포트.
 *
 * Application Service가 transcript + chat을 한 묶음으로 넘기면 구현체는
 * 외부 LLM(API 또는 in-house)을 호출해 구조화된 `ReportSummary`를 돌려준다.
 * 모델 공급자(예: Gemini, OpenAI 등)는 env 스위치로 교체 가능하다.
 *
 * 구현체는 본 인터페이스 외 부수 효과를 일으키지 않으며, 실패는 throw로
 * 표현한다. Application Service가 throw를 받아 `markSummaryFailed`로 전이한다.
 */
export interface SummarizerPort {
  summarize(input: SummarizerInput): Promise<ReportSummary>;
}

/**
 * LLM 입력 묶음. 회의 메타데이터(`meta`)는 모델 프롬프트에서 제목·날짜 등을
 * 채우는 용도이며, transcript/chat이 비어 있더라도 본 호출 자체는 합법이다
 * (구현체는 빈 입력에 대해 의미 있는 요약을 줄 의무가 없다).
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