import { ChatEntry, ExternalReference, MeetingType, Source } from '../value-objects';

export type MeetingEndedReason = 'manual' | 'idle';

export interface MeetingEndedParticipant {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

/**
 * `meeting.ended` 도메인 이벤트 payload.
 */
export interface MeetingEndedPayload {
  readonly code: string;
  readonly source: Source;
  readonly meetingType: MeetingType;
  readonly externalReference: ExternalReference;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly reason: MeetingEndedReason;
  readonly participants: ReadonlyArray<MeetingEndedParticipant>;
  readonly chat: ReadonlyArray<ChatEntry>;
  readonly title: string | null;
}
