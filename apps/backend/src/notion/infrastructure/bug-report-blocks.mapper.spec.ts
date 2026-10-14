import { BugReport } from '@/notion/domain/ports/notion-bug-report.port';

import { buildBugReportPage } from './bug-report-blocks.mapper';

const report = (overrides: Partial<BugReport> = {}): BugReport => ({
  summary: '회의에 입장했는데 상대방 소리가 들리지 않았습니다.',
  locations: ['meeting'],
  steps: ['회의 입장', '상대가 말함'],
  imageUploadIds: [],
  reportedAt: new Date('2026-10-14T05:30:00.000Z'),
  ...overrides,
});

type Block = { type: string } & Record<string, unknown>;

const textOf = (block: Block): string => {
  const body = block[block.type] as { rich_text?: Array<{ text: { content: string } }> };
  return (body.rich_text ?? []).map((r) => r.text.content).join('');
};

const sectionAfter = (children: ReadonlyArray<Block>, heading: string): Block[] => {
  const start = children.findIndex((b) => b.type === 'heading_3' && textOf(b) === heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = children.slice(start + 1);
  const end = rest.findIndex((b) => b.type === 'heading_3');
  return end === -1 ? rest : rest.slice(0, end);
};

describe('buildBugReportPage', () => {
  it('제목은 [버그] 와 무슨 일이 있었나요의 첫 줄이고, 길면 줄인다', () => {
    expect(buildBugReportPage(report({ summary: '소리가 안 들려요\n둘째 줄' })).title).toBe(
      '[버그] 소리가 안 들려요',
    );
    const long = buildBugReportPage(report({ summary: '가'.repeat(200) })).title;
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith('…')).toBe(true);
  });

  it('양식 순서대로 섹션 제목을 둔다', () => {
    const headings = buildBugReportPage(report())
      .children.filter((b) => b.type === 'heading_3')
      .map(textOf);
    expect(headings).toEqual([
      '무슨 일이 있었나요',
      '어디서 발생했나요',
      '회의 코드와 발생 시각',
      '재현 방법',
      '기대한 동작',
      '사용 환경',
      '화면 캡쳐',
      '그 밖에',
    ]);
  });

  it('발생 위치는 전체 선택지를 체크박스로 두고 고른 것만 체크한다', () => {
    const { children } = buildBugReportPage(
      report({ locations: ['meeting', 'other'], otherLocation: '설정 화면' }),
    );
    const todos = sectionAfter(children, '어디서 발생했나요');
    expect(todos.every((b) => b.type === 'to_do')).toBe(true);
    const checked = todos.filter((b) => (b.to_do as { checked: boolean }).checked).map(textOf);
    expect(checked).toEqual(['회의 화면', '그 외: 설정 화면']);
    expect(todos).toHaveLength(5);
  });

  it('재현 방법은 번호 목록이고, 비어 있으면 입력 없음으로 남긴다', () => {
    const steps = sectionAfter(buildBugReportPage(report()).children, '재현 방법');
    expect(steps.map((b) => b.type)).toEqual(['numbered_list_item', 'numbered_list_item']);
    expect(steps.map(textOf)).toEqual(['회의 입장', '상대가 말함']);

    const empty = sectionAfter(buildBugReportPage(report({ steps: [] })).children, '재현 방법');
    expect(empty.map(textOf)).toEqual(['(입력 없음)']);
  });

  it('회의 코드·발생 시각·사용 환경을 항목으로 적고, 빈 값은 입력 없음으로 둔다', () => {
    const { children } = buildBugReportPage(
      report({ meetingCode: 'abc12xyz', device: 'Windows 11', browser: 'Chrome 141' }),
    );
    expect(sectionAfter(children, '회의 코드와 발생 시각').map(textOf)).toEqual([
      '회의 코드: abc12xyz',
      '발생 시각: (입력 없음)',
    ]);
    expect(sectionAfter(children, '사용 환경').map(textOf)).toEqual([
      '기기 / OS: Windows 11',
      '브라우저: Chrome 141',
      '네트워크: (입력 없음)',
    ]);
  });

  it('업로드한 이미지는 화면 캡쳐 섹션에 file_upload 이미지 블록으로 붙인다', () => {
    const shots = sectionAfter(
      buildBugReportPage(report({ imageUploadIds: ['fu-1', 'fu-2'] })).children,
      '화면 캡쳐',
    );
    expect(shots).toEqual([
      { type: 'image', image: { type: 'file_upload', file_upload: { id: 'fu-1' } } },
      { type: 'image', image: { type: 'file_upload', file_upload: { id: 'fu-2' } } },
    ]);
  });

  it('마지막에 Convene 에서 접수된 시각을 남긴다', () => {
    const { children } = buildBugReportPage(report());
    expect(textOf(children[children.length - 1])).toContain('2026-10-14T05:30:00.000Z');
  });
});
