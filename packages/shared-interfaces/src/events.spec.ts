import { describe, expect, it } from 'vitest';

import {
  type DomainEventName,
  MEDIASOUP_EVENTS,
  type MediasoupEventName,
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

  it('모든 mediasoup 이벤트는 mediasoup. prefix를 사용한다', () => {
    for (const name of Object.values(MEDIASOUP_EVENTS)) {
      expect(name.startsWith('mediasoup.')).toBe(true);
    }
  });

  it('meeting 6 + report 5 + mediasoup 3 = 14개, 모두 서로 다르다 (ARCHITECTURE §2.4 + STT fail 분기)', () => {
    const meeting = Object.values(MEETING_EVENTS);
    const report = Object.values(REPORT_EVENTS);
    const mediasoup = Object.values(MEDIASOUP_EVENTS);
    expect(meeting).toHaveLength(6);
    expect(report).toHaveLength(5);
    expect(mediasoup).toHaveLength(3);
    expect(new Set([...meeting, ...report, ...mediasoup]).size).toBe(14);
  });

  it('report.transcription.failed가 노출되어 Recording BC가 STT 실패를 보고할 수 있다', () => {
    expect(REPORT_EVENTS.TRANSCRIPTION_FAILED).toBe('report.transcription.failed');
  });

  it('DomainEventName은 Meeting/Report/Mediasoup EventName의 union이다', () => {
    const a: MeetingEventName = MEETING_EVENTS.CREATED;
    const b: ReportEventName = REPORT_EVENTS.FINALIZED;
    const c: MediasoupEventName = MEDIASOUP_EVENTS.PRODUCER_CREATED;
    const d: DomainEventName = a;
    const e: DomainEventName = b;
    const f: DomainEventName = c;
    expect([a, b, c, d, e, f]).toEqual([
      'meeting.created',
      'report.finalized',
      'mediasoup.producer.created',
      'meeting.created',
      'report.finalized',
      'mediasoup.producer.created',
    ]);
  });
});
