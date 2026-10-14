import { BUG_REPORT_LOCATION_LABELS, BUG_REPORT_LOCATIONS } from '@convene/shared-interfaces';

import { BugReport } from '@/notion/domain/ports/notion-bug-report.port';

type NotionBlock = { type: string } & Record<string, unknown>;

const TITLE_PREFIX = '[버그] ';
const TITLE_MAX = 80;
const EMPTY = '(입력 없음)';

const richText = (content: string) => [{ type: 'text', text: { content } }];

const block = (type: string, body: Record<string, unknown>): NotionBlock => ({
  type,
  [type]: body,
});

const heading = (content: string) => block('heading_3', { rich_text: richText(content) });
const paragraph = (content: string) => block('paragraph', { rich_text: richText(content) });
const bullet = (content: string) => block('bulleted_list_item', { rich_text: richText(content) });
const numbered = (content: string) => block('numbered_list_item', { rich_text: richText(content) });
const todo = (content: string, checked: boolean) =>
  block('to_do', { rich_text: richText(content), checked });
const image = (uploadId: string) =>
  block('image', { type: 'file_upload', file_upload: { id: uploadId } });

const orEmpty = (value: string | undefined): string =>
  value === undefined || value.trim().length === 0 ? EMPTY : value.trim();

function toTitle(summary: string): string {
  const firstLine = summary.trim().split('\n')[0].trim();
  return firstLine.length > TITLE_MAX
    ? `${TITLE_PREFIX}${firstLine.slice(0, TITLE_MAX - 1)}…`
    : `${TITLE_PREFIX}${firstLine}`;
}

function locationBlocks(report: BugReport): NotionBlock[] {
  return BUG_REPORT_LOCATIONS.map((location) => {
    const label = BUG_REPORT_LOCATION_LABELS[location];
    const text =
      location === 'other' &&
      report.otherLocation !== undefined &&
      report.otherLocation.trim() !== ''
        ? `${label}: ${report.otherLocation.trim()}`
        : label;
    return todo(text, report.locations.includes(location));
  });
}

/** 버그 리포트 양식을 노션 이슈의 제목과 본문 블록으로 옮긴다. 섹션 순서는 양식 그대로다. */
export function buildBugReportPage(report: BugReport): {
  readonly title: string;
  readonly children: ReadonlyArray<NotionBlock>;
} {
  const steps = report.steps.filter((s) => s.trim().length > 0);
  return {
    title: toTitle(report.summary),
    children: [
      heading('무슨 일이 있었나요'),
      paragraph(report.summary.trim()),
      heading('어디서 발생했나요'),
      ...locationBlocks(report),
      heading('회의 코드와 발생 시각'),
      bullet(`회의 코드: ${orEmpty(report.meetingCode)}`),
      bullet(`발생 시각: ${orEmpty(report.occurredAt)}`),
      heading('재현 방법'),
      ...(steps.length === 0 ? [paragraph(EMPTY)] : steps.map((s) => numbered(s.trim()))),
      heading('기대한 동작'),
      paragraph(orEmpty(report.expected)),
      heading('사용 환경'),
      bullet(`기기 / OS: ${orEmpty(report.device)}`),
      bullet(`브라우저: ${orEmpty(report.browser)}`),
      bullet(`네트워크: ${orEmpty(report.network)}`),
      heading('화면 캡쳐'),
      ...(report.imageUploadIds.length === 0
        ? [paragraph(EMPTY)]
        : report.imageUploadIds.map(image)),
      heading('그 밖에'),
      paragraph(orEmpty(report.notes)),
      block('divider', {}),
      paragraph(`Convene 버그 리포트로 접수됨 · ${report.reportedAt.toISOString()}`),
    ],
  };
}
