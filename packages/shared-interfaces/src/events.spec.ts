import { describe, expect, it } from 'vitest';

import {
  type DomainEventName,
  MEETING_EVENTS,
  type MeetingEventName,
  REPORT_EVENTS,
  type ReportEventName,
} from './events.js';

describe('도메인 이벤트 이름', () => {
  it('모든 meeting 이벤트는 meeting. prefix를 사용한다', () => {
    for (const name of Object.values(MEETING_EVENTS)) {
      expect(name.startsWith('meeting.')).toBe(true);
    }
  });

  it('모든 report 이벤트는 report. prefix를 사용한다', () => {
    for (const name of Object.values(REPORT_EVENTS)) {
      expect(name.startsWith('report.')).toBe(true);
    }
  });

  it('ARCHITECTURE §2.4와 일치: meeting 6 + report 4 = 10개, 모두 서로 다르다', () => {
    const meeting = Object.values(MEETING_EVENTS);
    const report = Object.values(REPORT_EVENTS);
    expect(meeting).toHaveLength(6);
    expect(report).toHaveLength(4);
    expect(new Set([...meeting, ...report]).size).toBe(10);
  });

  it('DomainEventName은 MeetingEventName과 ReportEventName의 union이다', () => {
    const a: MeetingEventName = MEETING_EVENTS.CREATED;
    const b: ReportEventName = REPORT_EVENTS.FINALIZED;
    const c: DomainEventName = a;
    const d: DomainEventName = b;
    expect([a, b, c, d]).toEqual([
      'meeting.created',
      'report.finalized',
      'meeting.created',
      'report.finalized',
    ]);
  });
});
