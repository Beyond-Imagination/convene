import { ChatEntry, ExternalReference, Source } from '../value-objects';

/**
 * `meeting.ended` 도메인 이벤트 payload.
 *
 * Meeting BC 가 회의 종료(수동/idle) 시 발행하고, Reports BC 의 Listener 가 받아
 * 회의록 draft 를 생성한다. 두 BC 가 cross-import 없이 본 인터페이스로만 결합한다
 * (CLAUDE.md hard rule 7).
 *
 * `participants` 와 `chat` 은 종료 시점의 누적 스냅숏이며, Reports BC 는 이를
 * `ParticipantEntry` / `ChatEntry` 로 변환하지 않고 Aggregate 입력에 그대로 사용한다.
 */
export type MeetingEndedReason = 'manual' | 'idle';

export interface MeetingEndedParticipant {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

export interface MeetingEndedPayload {
  readonly code: string;
  readonly source: Source;
  readonly externalReference: ExternalReference;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly reason: MeetingEndedReason;
  readonly participants: ReadonlyArray<MeetingEndedParticipant>;
  readonly chat: ReadonlyArray<ChatEntry>;
  /** 회의 생성 시 지정한 제목. 없으면 null. Reports BC 가 회의록 제목 후보로 쓴다. */
  readonly title: string | null;
}
