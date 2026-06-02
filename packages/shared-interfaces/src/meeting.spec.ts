import { describe, expect, it } from 'vitest';

import {
  type CloseMeetingResponse,
  type CreateMeetingRequest,
  type CreateMeetingResponse,
  type ExternalReferencePayload,
  MEETING_WS_EVENTS,
  type MeetingEndedBroadcast,
  type MeetingWsEventName,
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

  it('MEETING_WS_EVENTS는 client→server 3개 + server→client 5개 = 총 8개', () => {
    expect(Object.values(MEETING_WS_EVENTS)).toHaveLength(8);
    expect(new Set(Object.values(MEETING_WS_EVENTS)).size).toBe(8);
  });

  it('MEETING_WS_EVENTS.ENDED 는 회의 종료 broadcast 의 채널 이름이다', () => {
    expect(MEETING_WS_EVENTS.ENDED).toBe('meeting:ended');
  });

  it('MeetingEndedBroadcast 는 code + endedAt(ISO) 필드를 가진다', () => {
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
