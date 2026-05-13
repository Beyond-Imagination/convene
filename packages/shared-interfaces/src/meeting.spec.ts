import { describe, expect, it } from 'vitest';

import {
  type CloseMeetingResponse,
  type CreateMeetingRequest,
  type CreateMeetingResponse,
  type ExternalReferencePayload,
  SOURCES,
  type Source,
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

  it('CreateMeetingResponse는 code / source / startedAt(ISO)을 가진다', () => {
    const r: CreateMeetingResponse = {
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(r.code).toMatch(/^[a-z0-9]{8}$/);
  });

  it('CloseMeetingResponse는 code / endedAt(ISO)을 가진다', () => {
    const r: CloseMeetingResponse = {
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    };
    expect(r.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
