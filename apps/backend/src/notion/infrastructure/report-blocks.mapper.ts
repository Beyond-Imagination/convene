import { FinalizedReport } from '@/reports/application/report-lookup.service';
import { ActionItem } from '@/shared-kernel/domain/value-objects/report-summary';
import { KeyTopic } from '@/shared-kernel/domain/value-objects/report-summary';
import { ReportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

export const REPORT_ANCHOR_LABEL = 'Convene 회의록';

const NO_SUMMARY_NOTICE = '요약을 만들지 못한 회의입니다.';

type NotionBlock = Record<string, unknown>;

function richText(content: string, annotations?: Record<string, unknown>): Record<string, unknown> {
  const run: Record<string, unknown> = { type: 'text', text: { content } };
  if (annotations !== undefined) run.annotations = annotations;
  return run;
}

function block(type: string, body: Record<string, unknown>): NotionBlock {
  return { object: 'block', type, [type]: body };
}

function paragraph(runs: ReadonlyArray<Record<string, unknown>>): NotionBlock {
  return block('paragraph', { rich_text: runs });
}

function heading(content: string): NotionBlock {
  return block('heading_3', { rich_text: [richText(content)] });
}

function bullet(content: string): NotionBlock {
  return block('bulleted_list_item', { rich_text: [richText(content)] });
}

function todo(content: string): NotionBlock {
  return block('to_do', { rich_text: [richText(content)], checked: false });
}

function actionItemText(item: ActionItem): string {
  const details: string[] = [];
  if (item.owner !== undefined) details.push(`담당: ${item.owner}`);
  if (item.due !== undefined) details.push(`기한: ${item.due}`);
  return details.length === 0 ? item.task : `${item.task} (${details.join(', ')})`;
}

// 노션 append는 중첩 깊이가 제한돼 토픽과 포인트를 형제 블록으로 편다.
function keyTopicBlocks(topic: KeyTopic): NotionBlock[] {
  return [paragraph([richText(topic.topic, { bold: true })]), ...topic.points.map(bullet)];
}

function summaryBlocks(summary: ReportSummary): NotionBlock[] {
  const blocks: NotionBlock[] = [heading('요약'), paragraph([richText(summary.overview)])];
  if (summary.decisions.length > 0) {
    blocks.push(heading('결정사항'), ...summary.decisions.map(bullet));
  }
  if (summary.actionItems.length > 0) {
    blocks.push(heading('액션 아이템'), ...summary.actionItems.map((i) => todo(actionItemText(i))));
  }
  if (summary.keyTopics.length > 0) {
    blocks.push(heading('핵심 토픽'), ...summary.keyTopics.flatMap(keyTopicBlocks));
  }
  return blocks;
}

export interface ReportBlocks {
  /** 회의록 전체를 감싸는 toggle. children 없이 먼저 append하고 id를 받는다. */
  readonly wrapper: NotionBlock;
  readonly children: ReadonlyArray<NotionBlock>;
}

export function toReportBlocks(report: FinalizedReport): ReportBlocks {
  const label =
    report.title === null ? REPORT_ANCHOR_LABEL : `${REPORT_ANCHOR_LABEL} · ${report.title}`;
  const wrapper = block('toggle', {
    rich_text: [
      richText(label),
      // 재삽입 때 이 toggle을 다시 찾아내는 marker.
      richText(` ${report.reportId}`, { code: true, color: 'gray' }),
    ],
  });
  const children =
    report.summary === null
      ? [paragraph([richText(NO_SUMMARY_NOTICE)])]
      : summaryBlocks(report.summary);
  return { wrapper, children };
}
