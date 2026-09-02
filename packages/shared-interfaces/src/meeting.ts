/*
 * Meeting의 HTTP wire format.
 *
 * 본 파일은 frontend ↔ backend가 공유하는 **순수 TS 인터페이스 / literal 타입**만 정의한다.
 */

export const SOURCES = ['web', 'notion-issue'] as const;
export type Source = (typeof SOURCES)[number];

export const MEETING_TYPES = ['general', 'retrospective', 'weekly-sync'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

/** 예약(코드만 발급) → 열림(첫 입장) → 종료. */
export const MEETING_STATUSES = ['scheduled', 'open', 'closed'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

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
  meetingType?: MeetingType;
  externalReference?: ExternalReferencePayload;
  title?: string;
}

export interface CreateMeetingResponse {
  code: string;
  source: Source;
  startedAt: string;
  hostToken: string;
}

/**
 * GET /meetings/:code 응답. 회의에 들어가지 않고 상태만 확인하는 용도(노션 임베드 카드 등)라
 * hostToken 같은 민감 값은 싣지 않는다.
 */
export interface MeetingDetailResponse {
  code: string;
  title: string | null;
  status: MeetingStatus;
  participantCount: number;
  /** 방이 열린 시각. 아직 열리지 않은 예약 회의는 null. */
  startedAt: string | null;
  endedAt: string | null;
}

/**
 * DELETE /meetings/:code 응답. 수동 종료(reason='manual') 전용.
 * idle 종료는 서버 내부 스케줄러가 직접 도메인 use case를 호출하므로 HTTP 응답으로 노출되지 않는다.
 */
export interface CloseMeetingResponse {
  code: string;
  endedAt: string;
}

/**
 * Meeting의 WebSocket 이벤트 이름.
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
  /** 유예 안에 돌아오면 RECONNECTED, 넘기면 LEFT가 이어진다. 수신 측은 타일을 지우지 않는다. */
  PARTICIPANT_DISCONNECTED: 'meeting:participantDisconnected',
  PARTICIPANT_RECONNECTED: 'meeting:participantReconnected',
  /**
   * 새로 입장한 참가자에게만 emit.
   * 회의 입장 직후 기존 참가자 목록을 한 번 전달해 자동 재연결/늦은 입장에서 stale 한 빈 목록을 보지 않게 한다.
   */
  PARTICIPANTS: 'meeting:participants',
  CHAT_POSTED: 'meeting:chatPosted',
  /**
   * 회의가 종료(수동 / idle 자동)됐음을 같은 room의 모든 참가자에게 알린다.
   * 수신 측 frontend는 회의 화면을 떠나 회의록 페이지로 이동한다.
   * 회의 종료를 직접 트리거한 본인은 이미 socket.disconnect 했으므로 본 이벤트를 받지 않고, 나머지 참가자만 받아 자동으로 회의에서 빠진다.
   */
  ENDED: 'meeting:ended',
} as const;

export type MeetingWsEventName = (typeof MEETING_WS_EVENTS)[keyof typeof MEETING_WS_EVENTS];

// ---------- client → server ----------

export interface JoinMeetingMessage {
  code: string;
  nickname: string;
  /** 재연결·새로고침을 넘어 유지되는 식별자. 없으면 서버가 socket.id로 대체한다. */
  participantId?: string;
}

export interface LeaveMeetingMessage {
  code: string;
}

export interface ChatMessage {
  code: string;
  text: string;
}

// ---------- server → client (ack) ----------

/**
 * `meeting:join` 요청에 대한 응답.
 *
 * 빈 방에 처음 들어온 참가자는 방장이 되어 `hostToken`을 받는다. 그 외에는 null이며,
 * 이미 토큰을 갖고 있던 클라이언트(회의를 만든 본인·재연결)는 기존 토큰을 유지하면 된다.
 */
export interface JoinMeetingAck {
  ok: true;
  hostToken: string | null;
  participantId: string;
  reconnected: boolean;
  /** 끊긴 동안 오간 대화를 복원하는 경로. 새로고침·늦은 입장도 이걸로 채워진다. */
  chat: ChatPostedBroadcast[];
}

export type JoinMeetingRejectReason = 'not-found' | 'closed';

export interface JoinMeetingRejectAck {
  ok: false;
  reason: JoinMeetingRejectReason;
}

export type JoinMeetingResponse = JoinMeetingAck | JoinMeetingRejectAck;

// ---------- server → client (broadcast) ----------

export interface ParticipantJoinedBroadcast {
  participantId: string;
  nickname: string;
  joinedAt: string;
}

export interface ParticipantLeftBroadcast {
  participantId: string;
  leftAt: string;
}

export interface ParticipantDisconnectedBroadcast {
  participantId: string;
  disconnectedAt: string;
}

export interface ParticipantReconnectedBroadcast {
  participantId: string;
  reconnectedAt: string;
}

export interface ChatPostedBroadcast {
  nickname: string;
  text: string;
  sentAt: string;
}

export interface MeetingParticipantEntry {
  participantId: string;
  nickname: string;
  joinedAt: string;
  disconnected: boolean;
}

/**
 * 회의 입장 직후 본인에게만 전달되는 기존 참가자 목록.
 */
export interface MeetingParticipantsBroadcast {
  participants: MeetingParticipantEntry[];
}

/**
 * 회의가 종료(수동 / idle 자동)됐음을 같은 room의 모든 참가자에게 알리는 broadcast.
 */
export interface MeetingEndedBroadcast {
  code: string;
  endedAt: string;
}
