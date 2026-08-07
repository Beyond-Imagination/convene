import { ChatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';
import { ExternalReference } from '@/shared-kernel/domain/value-objects/external-reference';
import { MeetingType } from '@/shared-kernel/domain/value-objects/meeting-type';
import { Source } from '@/shared-kernel/domain/value-objects/source';

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

export interface ReportTranscriptionRequestedPayload {
  readonly reportId: string;
  readonly meetingId: string;
  readonly code: string;
  readonly meetingStartedAtMs: number;
  readonly participantNames?: Readonly<Record<string, string>>;
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

export interface ReportFinalizedPayload {
  readonly reportId: string;
}
