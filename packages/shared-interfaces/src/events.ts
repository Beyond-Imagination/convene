/**
 * 도메인 이벤트 이름 상수.
 *
 * Prefix 규칙:
 *   - `meeting.*`   — Meeting 도메인.
 *   - `report.*`    — Report 도메인.
 *   - `mediasoup.*` — Mediasoup 도메인.
 *
 * 백엔드의 `@nestjs/event-emitter`와 향후 다른 이벤트 버스가 사용할 이벤트 이름 문자열.
 */

export const MEETING_EVENTS = {
  CREATED: 'meeting.created',
  /**
   * 회의 방이 실제로 열렸다. 즉시 생성은 `created`와 같은 시점, 예약 회의는 첫 참가자가 들어온 시점.
   * 미디어 리소스는 이 이벤트를 받고 만든다(아무도 오지 않은 예약 회의가 워커를 점유하지 않도록).
   */
  OPENED: 'meeting.opened',
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
