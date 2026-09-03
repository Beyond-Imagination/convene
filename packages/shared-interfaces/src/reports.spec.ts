import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REPORT_PAGE_SIZE,
  DEFAULT_REPORT_SORT,
  MAX_REPORT_PAGE_SIZE,
  REPORT_SORT_OPTIONS,
  type ReportDetailResponse,
  type ReportListItem,
  type ReportListResponse,
  type ReportPipelineStage,
  type ReportPipelineStatus,
  type ReportSortOption,
} from './reports.js';

describe('Reports wire format constants', () => {
  it('목록의 기본/최대 페이지 크기 상수를 노출한다', () => {
    expect(DEFAULT_REPORT_PAGE_SIZE).toBe(20);
    expect(MAX_REPORT_PAGE_SIZE).toBe(100);
    expect(DEFAULT_REPORT_PAGE_SIZE).toBeLessThanOrEqual(MAX_REPORT_PAGE_SIZE);
  });

  it('정렬은 이름 있는 프리셋 목록이고 기본값은 latest다', () => {
    const option: ReportSortOption = DEFAULT_REPORT_SORT;
    expect(REPORT_SORT_OPTIONS).toContain(option);
    expect(DEFAULT_REPORT_SORT).toBe('latest');
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
      notionSynced: true,
    };
    const response: ReportListResponse = {
      items: [item],
      page: { number: 2, size: 20, totalItems: 43, totalPages: 3 },
    };
    expect(response.items[0].id).toBe('r1');
    expect(response.items[0].notionSynced).toBe(true);
    expect(response.page.totalPages).toBe(3);
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
      chat: [{ nickname: '준', text: '안녕', sentAt: '2026-01-01T00:01:00.000Z' }],
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
