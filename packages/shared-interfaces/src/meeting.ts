/**
 * Meeting bounded context의 HTTP wire format.
 *
 * 본 파일은 frontend ↔ backend가 공유하는 **순수 TS 인터페이스 / literal 타입**만
 * 정의한다. class-validator 데코레이터는 backend `dto/` 클래스가 본 인터페이스를
 * implements하면서 추가한다 (CLAUDE.md hard rule 2).
 */

export const SOURCES = ['web', 'notion-issue'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * 회의를 만들어낸 외부 시스템의 식별자.
 *   - v1.0.0: 항상 비어 있거나 미전송.
 *   - v2.0.0: 노션 이슈에서 회의가 생성될 때 `issueId`가 채워진다.
 */
export interface ExternalReferencePayload {
  issueId?: string;
}

export interface CreateMeetingRequest {
  source: Source;
  externalReference?: ExternalReferencePayload;
}

export interface CreateMeetingResponse {
  code: string;
  source: Source;
  startedAt: string;
}

/**
 * DELETE /meetings/:code 응답. 수동 종료(reason='manual') 전용.
 * idle 종료는 서버 내부 스케줄러가 직접 도메인 use case를 호출하므로
 * HTTP 응답으로 노출되지 않는다.
 */
export interface CloseMeetingResponse {
  code: string;
  endedAt: string;
}

/**
 * Meeting bounded context의 WebSocket 이벤트 이름.
 *
 * 도메인 이벤트(`meeting.*` dot prefix)와 구분하기 위해 **colon** prefix를 사용한다.
 *   - `meeting:join` / `meeting:leave` / `meeting:chat` — client → server 요청
 *   - `meeting:participantJoined` / `meeting:participantLeft` / `meeting:chatPosted`
 *     — server → client 브로드캐스트
 */
export const MEETING_WS_EVENTS = {
  JOIN: 'meeting:join',
  LEAVE: 'meeting:leave',
  CHAT: 'meeting:chat',
  PARTICIPANT_JOINED: 'meeting:participantJoined',
  PARTICIPANT_LEFT: 'meeting:participantLeft',
  /**
   * 새로 입장한 참가자에게만 emit. 회의 입장 직후 기존 참가자 목록을 한 번
   * 전달해 자동 재연결/늦은 입장에서 stale 한 빈 목록을 보지 않게 한다.
   * (자신은 포함되지 않음)
   */
  PARTICIPANTS: 'meeting:participants',
  CHAT_POSTED: 'meeting:chatPosted',
  /**
   * 회의가 종료(수동 / idle 자동)됐음을 같은 room 의 모든 참가자에게 알린다.
   * 수신 측 frontend 는 회의 화면을 떠나 회의록 페이지로 이동한다.
   * 회의 종료를 직접 트리거한 본인은 이미 socket.disconnect 했으므로 본 이벤트를
   * 받지 않고, 나머지 참가자만 받아 자동으로 회의에서 빠진다.
   */
  ENDED: 'meeting:ended',
} as const;

export type MeetingWsEventName = (typeof MEETING_WS_EVENTS)[keyof typeof MEETING_WS_EVENTS];

// ---------- client → server ----------

export interface JoinMeetingMessage {
  code: string;
  nickname: string;
}

export interface LeaveMeetingMessage {
  code: string;
}

export interface ChatMessage {
  code: string;
  text: string;
}

// ---------- server → client (broadcast) ----------

export interface ParticipantJoinedBroadcast {
  socketId: string;
  nickname: string;
  joinedAt: string;
}

export interface ParticipantLeftBroadcast {
  socketId: string;
  leftAt: string;
}

export interface ChatPostedBroadcast {
  nickname: string;
  text: string;
  sentAt: string;
}

/**
 * 회의 입장 직후 본인에게만 전달되는 기존 참가자 목록.
 */
export interface MeetingParticipantsBroadcast {
  participants: ParticipantJoinedBroadcast[];
}

/**
 * 회의가 종료(수동 / idle 자동)됐음을 같은 room 의 모든 참가자에게 알리는 broadcast.
 */
export interface MeetingEndedBroadcast {
  code: string;
  endedAt: string;
}
