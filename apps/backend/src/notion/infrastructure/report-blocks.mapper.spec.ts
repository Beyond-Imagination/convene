import { FinalizedReport } from '@/reports/application/report-lookup.service';
import { reportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

import { toReportBlocks } from './report-blocks.mapper';

const baseReport = (overrides: Partial<FinalizedReport> = {}): FinalizedReport => ({
  reportId: 'rep_001',
  meetingType: 'general',
  issueId: 'issue_1',
  title: '주간 회의',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: new Date('2026-01-01T00:30:00Z'),
  summary: reportSummary({
    title: '요약 제목',
    overview: '이번 회의 개요',
    decisions: ['금요일 배포'],
    actionItems: [{ owner: '준', task: '문서 정리', due: '수요일' }],
    keyTopics: [{ topic: '배포', points: ['스테이징 검증', '롤백 절차'] }],
  }),
  ...overrides,
});

/** 블록에서 사람이 읽는 텍스트만 뽑아 단언을 간결하게 한다. */
const plainText = (block: Record<string, unknown>): string => {
  const body = block[block.type as string] as { rich_text?: ReadonlyArray<unknown> };
  return (body.rich_text ?? [])
    .map((run) => (run as { text?: { content?: string } }).text?.content ?? '')
    .join('');
};

const typesOf = (blocks: ReadonlyArray<Record<string, unknown>>): string[] =>
  blocks.map((b) => b.type as string);

describe('toReportBlocks', () => {
  it('wrapper는 회의 제목과 reportId를 담은 toggle이다', () => {
    const { wrapper } = toReportBlocks(baseReport());

    expect(wrapper.type).toBe('toggle');
    expect(plainText(wrapper)).toContain('주간 회의');
    // 재삽입 시 앵커를 찾는 marker.
    expect(plainText(wrapper)).toContain('rep_001');
  });

  it('회의 제목이 없어도 reportId marker는 유지된다', () => {
    const { wrapper } = toReportBlocks(baseReport({ title: null }));

    expect(plainText(wrapper)).toContain('rep_001');
  });

  it('요약 4필드를 요약·결정사항·액션아이템·핵심토픽 순서로 펼친다', () => {
    const { children } = toReportBlocks(baseReport());

    const headings = children.filter((b) => b.type === 'heading_3').map(plainText);
    expect(headings).toEqual(['요약', '결정사항', '액션 아이템', '핵심 토픽']);
    expect(children.map(plainText)).toContain('이번 회의 개요');
  });

  it('비어 있는 섹션은 heading까지 생략한다', () => {
    const { children } = toReportBlocks(
      baseReport({
        summary: reportSummary({
          title: '요약 제목',
          overview: '개요만 있는 회의',
          decisions: [],
          actionItems: [],
          keyTopics: [],
        }),
      }),
    );

    expect(children.filter((b) => b.type === 'heading_3').map(plainText)).toEqual(['요약']);
  });

  it('액션 아이템은 담당·기한을 붙인 체크박스가 된다', () => {
    const { children } = toReportBlocks(baseReport());

    const todos = children.filter((b) => b.type === 'to_do');
    expect(todos).toHaveLength(1);
    expect(plainText(todos[0])).toBe('문서 정리 (담당: 준, 기한: 수요일)');
    expect((todos[0].to_do as { checked: boolean }).checked).toBe(false);
  });

  it('담당·기한이 없는 액션 아이템은 할 일만 적는다', () => {
    const { children } = toReportBlocks(
      baseReport({
        summary: reportSummary({
          title: '요약 제목',
          overview: '개요',
          decisions: [],
          actionItems: [{ task: '회고 일정 잡기' }],
          keyTopics: [],
        }),
      }),
    );

    expect(plainText(children.filter((b) => b.type === 'to_do')[0])).toBe('회고 일정 잡기');
  });

  it('핵심 토픽은 토픽 문단 + 포인트 불릿으로 평탄화한다', () => {
    const { children } = toReportBlocks(baseReport());

    // 노션 append는 중첩 깊이가 제한돼 토픽-포인트를 형제 블록으로 편다.
    const tail = children.slice(children.findIndex((b) => plainText(b) === '핵심 토픽'));
    expect(typesOf(tail)).toEqual([
      'heading_3',
      'paragraph',
      'bulleted_list_item',
      'bulleted_list_item',
    ]);
    expect(tail.map(plainText)).toEqual(['핵심 토픽', '배포', '스테이징 검증', '롤백 절차']);
  });

  it('결정사항은 불릿으로 나열한다', () => {
    const { children } = toReportBlocks(baseReport());

    const decisions = children.filter((b) => plainText(b) === '금요일 배포');
    expect(typesOf(decisions)).toEqual(['bulleted_list_item']);
  });

  it('요약이 없으면 안내 문단만 남긴다', () => {
    const { children } = toReportBlocks(baseReport({ summary: null }));

    expect(typesOf(children)).toEqual(['paragraph']);
    expect(children.filter((b) => b.type === 'heading_3')).toHaveLength(0);
  });
});
