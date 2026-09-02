import { describe, expect, it } from 'vitest';

import {
  type CloseMeetingResponse,
  type CreateMeetingRequest,
  type CreateMeetingResponse,
  type ExternalReferencePayload,
  type JoinMeetingAck,
  type JoinMeetingMessage,
  type JoinMeetingResponse,
  MEETING_STATUSES,
  MEETING_TYPES,
  MEETING_WS_EVENTS,
  type MeetingDetailResponse,
  type MeetingEndedBroadcast,
  type MeetingStatus,
  type MeetingType,
  type MeetingWsEventName,
  type ParticipantDisconnectedBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
  type ParticipantReconnectedBroadcast,
  type Source,
  SOURCES,
} from './meeting.js';

describe('meeting wire format', () => {
  it('SOURCES는 web과 notion-issue 두 가지를 가진다', () => {
    expect(SOURCES).toEqual(['web', 'notion-issue']);
  });

  it('Source는 SOURCES의 literal union이다 (컴파일 체크)', () => {
    const a: Source = 'web';
    const b: Source = 'notion-issue';
    expect([a, b]).toEqual(['web', 'notion-issue']);
  });

  it('CreateMeetingRequest는 source 필수 + externalReference 선택', () => {
    const r1: CreateMeetingRequest = { source: 'web' };
    const r2: CreateMeetingRequest = {
      source: 'notion-issue',
      externalReference: { issueId: 'NTN-1' } satisfies ExternalReferencePayload,
    };
    expect([r1.source, r2.externalReference?.issueId]).toEqual(['web', 'NTN-1']);
  });

  it('MEETING_TYPES는 general/retrospective/weekly-sync 세 가지를 가진다', () => {
    expect(MEETING_TYPES).toEqual(['general', 'retrospective', 'weekly-sync']);
  });

  it('MeetingType은 MEETING_TYPES의 literal union이다 (컴파일 체크)', () => {
    const t: MeetingType = 'retrospective';
    expect(MEETING_TYPES).toContain(t);
  });

  it('CreateMeetingRequest.meetingType은 선택이다(미지정 시 서버가 general로 채움)', () => {
    const r: CreateMeetingRequest = { source: 'notion-issue', meetingType: 'retrospective' };
    expect(r.meetingType).toBe('retrospective');
  });

  it('CreateMeetingResponse는 code / source / startedAt(ISO) / hostToken을 가진다', () => {
    const r: CreateMeetingResponse = {
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      hostToken: 'host-token-uuid',
    };
    expect(r.code).toMatch(/^[a-z0-9]{8}$/);
    expect(r.hostToken).toBe('host-token-uuid');
  });

  it('MEETING_STATUSES는 scheduled/open/closed 세 가지다', () => {
    expect(MEETING_STATUSES).toEqual(['scheduled', 'open', 'closed']);
  });

  it('MeetingStatus는 MEETING_STATUSES의 literal union이다 (컴파일 체크)', () => {
    const s: MeetingStatus = 'scheduled';
    expect(MEETING_STATUSES).toContain(s);
  });

  it('MeetingDetailResponse는 예약 회의를 startedAt=null로 표현한다', () => {
    const r: MeetingDetailResponse = {
      code: 'abc12xyz',
      title: '스프린트 회고',
      status: 'scheduled',
      participantCount: 0,
      startedAt: null,
      endedAt: null,
    };
    expect(r.startedAt).toBeNull();
  });

  it('MeetingDetailResponse에는 hostToken이 없다 (조회 전용)', () => {
    const r: MeetingDetailResponse = {
      code: 'abc12xyz',
      title: null,
      status: 'closed',
      participantCount: 0,
      startedAt: '2026-07-31T10:00:00.000Z',
      endedAt: '2026-07-31T11:00:00.000Z',
    };
    expect(Object.keys(r)).not.toContain('hostToken');
  });

  it('CloseMeetingResponse는 code / endedAt(ISO)을 가진다', () => {
    const r: CloseMeetingResponse = {
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    };
    expect(r.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('MEETING_WS_EVENTS는 모두 meeting: prefix를 사용한다 (도메인 이벤트의 dot prefix와 구분)', () => {
    for (const name of Object.values(MEETING_WS_EVENTS)) {
      expect(name.startsWith('meeting:')).toBe(true);
    }
  });

  it('MEETING_WS_EVENTS는 client→server 3개 + server→client 7개 = 총 10개', () => {
    expect(Object.values(MEETING_WS_EVENTS)).toHaveLength(10);
    expect(new Set(Object.values(MEETING_WS_EVENTS)).size).toBe(10);
  });

  it('JoinMeetingMessage는 재접속 판정을 위해 안정 participantId를 싣는다', () => {
    const m: JoinMeetingMessage = {
      code: 'abc12xyz',
      nickname: 'alice',
      participantId: 'p-ab12',
    };
    expect(m.participantId).toBe('p-ab12');
  });

  it('JoinMeetingAck은 재접속 여부와 놓친 채팅을 함께 돌려준다', () => {
    const ack: JoinMeetingAck = {
      ok: true,
      hostToken: null,
      participantId: 'p-ab12',
      reconnected: true,
      chat: [{ nickname: 'bob', text: '먼저 시작할게요', sentAt: '2026-01-01T00:00:10.000Z' }],
    };
    expect(ack.reconnected).toBe(true);
    expect(ack.chat).toHaveLength(1);
  });

  it('없는 회의 입장은 ok=false와 거부 사유로 돌아온다 (ok로 좁힌다)', () => {
    const response: JoinMeetingResponse = { ok: false, reason: 'not-found' };
    if (response.ok) throw new Error('거부 응답이어야 한다');
    expect(response.reason).toBe('not-found');
  });

  it('참가자 broadcast는 socket.id가 아닌 안정 participantId로 참가자를 지목한다', () => {
    const joined: ParticipantJoinedBroadcast = {
      participantId: 'p-ab12',
      nickname: 'alice',
      joinedAt: '2026-01-01T00:00:00.000Z',
    };
    const left: ParticipantLeftBroadcast = {
      participantId: 'p-ab12',
      leftAt: '2026-01-01T00:01:00.000Z',
    };
    expect([joined.participantId, left.participantId]).toEqual(['p-ab12', 'p-ab12']);
  });

  it('연결 끊김·재접속 broadcast는 퇴장과 별개 채널이다 (타일을 지우지 않고 상태만 바꾼다)', () => {
    expect(MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED).toBe('meeting:participantDisconnected');
    expect(MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED).toBe('meeting:participantReconnected');
    const d: ParticipantDisconnectedBroadcast = {
      participantId: 'p-ab12',
      disconnectedAt: '2026-01-01T00:00:30.000Z',
    };
    const r: ParticipantReconnectedBroadcast = {
      participantId: 'p-ab12',
      reconnectedAt: '2026-01-01T00:00:40.000Z',
    };
    expect([d.participantId, r.participantId]).toEqual(['p-ab12', 'p-ab12']);
  });

  it('MEETING_WS_EVENTS.ENDED는 회의 종료 broadcast의 채널 이름이다', () => {
    expect(MEETING_WS_EVENTS.ENDED).toBe('meeting:ended');
  });

  it('MeetingEndedBroadcast는 code + endedAt(ISO) 필드를 가진다', () => {
    const b: MeetingEndedBroadcast = {
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    };
    expect(b.code).toMatch(/^[a-z0-9]{8}$/);
    expect(b.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('MeetingWsEventName 타입은 MEETING_WS_EVENTS 값들의 literal union이다 (컴파일 체크)', () => {
    const a: MeetingWsEventName = MEETING_WS_EVENTS.JOIN;
    const b: MeetingWsEventName = MEETING_WS_EVENTS.CHAT_POSTED;
    expect([a, b]).toEqual(['meeting:join', 'meeting:chatPosted']);
  });
});
