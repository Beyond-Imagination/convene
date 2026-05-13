/**
 * Domain event names. See ARCHITECTURE.md §2.4.
 *
 * Prefix convention:
 *   - `meeting.*` — Meeting bounded context.
 *   - `report.*`  — Report bounded context.
 *
 * Single source of truth for event-name strings used by
 * `@nestjs/event-emitter` on the backend and any future bus.
 */

export const MEETING_EVENTS = {
  CREATED: 'meeting.created',
  PARTICIPANT_JOINED: 'meeting.participant.joined',
  PARTICIPANT_LEFT: 'meeting.participant.left',
  CHAT_POSTED: 'meeting.chat.posted',
  IDLE_DETECTED: 'meeting.idle.detected',
  ENDED: 'meeting.ended',
} as const;

export const REPORT_EVENTS = {
  TRANSCRIPTION_REQUESTED: 'report.transcription.requested',
  TRANSCRIPTION_COMPLETED: 'report.transcription.completed',
  SUMMARY_COMPLETED: 'report.summary.completed',
  FINALIZED: 'report.finalized',
} as const;

export type MeetingEventName = (typeof MEETING_EVENTS)[keyof typeof MEETING_EVENTS];
export type ReportEventName = (typeof REPORT_EVENTS)[keyof typeof REPORT_EVENTS];
export type DomainEventName = MeetingEventName | ReportEventName;
