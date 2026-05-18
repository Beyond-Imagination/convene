import { participantEntry } from '../domain/entries';
import { MeetingReport } from '../domain/meeting-report';
import { NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects';

import { NoopNotion } from './noop.notion';

describe('NoopNotion', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');

  it('push 호출 시 null을 돌려준다 (v1: 노션 연동 없음)', async () => {
    const notion = new NoopNotion();
    const report = MeetingReport.fromEndedMeeting({
      id: 'r1',
      meetingId: 'mtg-x',
      code: 'code-x',
      source: 'web',
      externalReference: NO_EXTERNAL_REFERENCE,
      startedAt,
      endedAt,
      participants: [
        participantEntry({ id: 'p1', nickname: 'a', joinedAt: startedAt, leftAt: endedAt }),
      ],
      chat: [],
    });
    expect(await notion.push(report.snapshot())).toBeNull();
  });
});
