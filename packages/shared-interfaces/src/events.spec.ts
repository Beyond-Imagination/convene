import { describe, expect, it } from 'vitest';

import {
  type DomainEventName,
  MEETING_EVENTS,
  type MeetingEventName,
  REPORT_EVENTS,
  type ReportEventName,
} from './events.js';

describe('domain event names', () => {
  it('every meeting event uses the meeting. prefix', () => {
    for (const name of Object.values(MEETING_EVENTS)) {
      expect(name.startsWith('meeting.')).toBe(true);
    }
  });

  it('every report event uses the report. prefix', () => {
    for (const name of Object.values(REPORT_EVENTS)) {
      expect(name.startsWith('report.')).toBe(true);
    }
  });

  it('matches ARCHITECTURE §2.4: 6 meeting + 4 report = 10 distinct events', () => {
    const meeting = Object.values(MEETING_EVENTS);
    const report = Object.values(REPORT_EVENTS);
    expect(meeting).toHaveLength(6);
    expect(report).toHaveLength(4);
    expect(new Set([...meeting, ...report]).size).toBe(10);
  });

  it('DomainEventName unifies meeting + report event unions', () => {
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
