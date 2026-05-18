import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REPORT_LIST_LIMIT,
  MAX_REPORT_LIST_LIMIT,
  REPORT_PIPELINE_STAGES,
  REPORT_PIPELINE_STATUSES,
  type ReportDetailResponse,
  type ReportListItem,
  type ReportListResponse,
  type ReportPipelineStage,
  type ReportPipelineStatus,
} from './reports.js';

describe('Reports wire format constants', () => {
  it('REPORT_PIPELINE_STATUSES는 pending|done|failed 3종이다', () => {
    expect(REPORT_PIPELINE_STATUSES).toEqual(['pending', 'done', 'failed']);
  });

  it('REPORT_PIPELINE_STAGES는 stt|summary 2종이다', () => {
    expect(REPORT_PIPELINE_STAGES).toEqual(['stt', 'summary']);
  });

  it('listRecent 기본/최대 limit 상수를 노출한다', () => {
    expect(DEFAULT_REPORT_LIST_LIMIT).toBe(20);
    expect(MAX_REPORT_LIST_LIMIT).toBe(100);
    expect(DEFAULT_REPORT_LIST_LIMIT).toBeLessThanOrEqual(MAX_REPORT_LIST_LIMIT);
  });
});

describe('Reports wire format type-compile checks', () => {
  it('ReportPipelineStatus / ReportPipelineStage는 narrow union이다', () => {
    const status: ReportPipelineStatus = 'pending';
    const stage: ReportPipelineStage = 'stt';
    expect(status).toBe('pending');
    expect(stage).toBe('stt');
  });

  it('ReportListItem과 ReportListResponse는 구조적 호환이 된다', () => {
    const item: ReportListItem = {
      id: 'r1',
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:30:00.000Z',
      participantCount: 1,
      pipeline: { sttStatus: 'done', summaryStatus: 'done' },
      title: '회의 요약',
    };
    const response: ReportListResponse = { items: [item] };
    expect(response.items[0].id).toBe('r1');
  });

  it('ReportDetailResponse는 도메인 Aggregate를 wire format으로 평면화한다', () => {
    const detail: ReportDetailResponse = {
      id: 'r1',
      meetingId: 'mtg-1',
      code: 'abc12xyz',
      source: 'web',
      externalReference: {},
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:30:00.000Z',
      participants: [
        {
          id: 'p1',
          nickname: '준',
          joinedAt: '2026-01-01T00:00:00.000Z',
          leftAt: '2026-01-01T00:30:00.000Z',
        },
      ],
      chat: [
        { nickname: '준', text: '안녕', sentAt: '2026-01-01T00:01:00.000Z' },
      ],
      transcript: [{ text: '안녕하세요', startMs: 0, endMs: 1000 }],
      summary: {
        title: '회의 요약',
        overview: '핵심',
        decisions: [],
        actionItems: [],
        keyTopics: [],
      },
      pipeline: { sttStatus: 'done', summaryStatus: 'done', failures: [] },
      pushedToNotion: null,
    };
    expect(detail.pipeline.failures).toEqual([]);
  });
});
