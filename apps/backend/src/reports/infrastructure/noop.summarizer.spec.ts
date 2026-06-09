import { chatEntry, NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects';

import { transcriptSegment } from '../domain/entries';
import { NoopSummarizer } from './noop.summarizer';

describe('NoopSummarizer', () => {
  const startedAt = new Date('2026-01-01T00:00:00Z');
  const endedAt = new Date('2026-01-01T00:30:00Z');

  it('호출 시 placeholder ReportSummary를 돌려준다', async () => {
    const summarizer = new NoopSummarizer();
    const summary = await summarizer.summarize({
      transcript: [transcriptSegment({ text: '안녕', startMs: 0, endMs: 100 })],
      chat: [chatEntry({ nickname: 'a', text: '하이', sentAt: startedAt })],
      meta: {
        meetingId: 'mtg-x',
        code: 'code-x',
        startedAt,
        endedAt,
      },
    });
    expect(summary.title).toBe('(요약 미적용)');
    expect(summary.decisions).toEqual([]);
    expect(summary.actionItems).toEqual([]);
    expect(summary.keyTopics).toEqual([]);
  });

  it('입력과 무관하게 동일한 placeholder 구조를 돌려준다', async () => {
    const summarizer = new NoopSummarizer();
    const a = await summarizer.summarize({
      transcript: [],
      chat: [],
      meta: { meetingId: 'a', code: 'a', startedAt, endedAt },
    });
    const b = await summarizer.summarize({
      transcript: [transcriptSegment({ text: '다른 입력', startMs: 0, endMs: 1 })],
      chat: [],
      meta: { meetingId: 'b', code: 'b', startedAt, endedAt },
    });
    expect(a).toEqual(b);
  });

  // 사용하지 않는 import 경고 회피 (NO_EXTERNAL_REFERENCE는 다른 spec에서 사용)
  void NO_EXTERNAL_REFERENCE;
});
