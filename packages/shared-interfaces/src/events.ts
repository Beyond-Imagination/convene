/**
 * 도메인 이벤트 이름 상수.
 *
 * Prefix 규칙:
 *   - `meeting.*`   — Meeting bounded context.
 *   - `report.*`    — Report bounded context.
 *   - `mediasoup.*` — Mediasoup bounded context.
 *
 * 백엔드의 `@nestjs/event-emitter`와 향후 다른 이벤트 버스가 사용할
 * 이벤트 이름 문자열의 단일 진실원(single source of truth).
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
  TRANSCRIPTION_FAILED: 'report.transcription.failed',
  SUMMARY_COMPLETED: 'report.summary.completed',
  FINALIZED: 'report.finalized',
} as const;

export const MEDIASOUP_EVENTS = {
  PRODUCER_CREATED: 'mediasoup.producer.created',
  PRODUCER_CLOSED: 'mediasoup.producer.closed',
  CONSUMER_CLOSED: 'mediasoup.consumer.closed',
} as const;

export type MeetingEventName = (typeof MEETING_EVENTS)[keyof typeof MEETING_EVENTS];
export type ReportEventName = (typeof REPORT_EVENTS)[keyof typeof REPORT_EVENTS];
export type MediasoupEventName = (typeof MEDIASOUP_EVENTS)[keyof typeof MEDIASOUP_EVENTS];
export type DomainEventName = MeetingEventName | ReportEventName | MediasoupEventName;
