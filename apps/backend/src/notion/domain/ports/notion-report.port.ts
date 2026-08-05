import { FinalizedReport } from '@/shared-kernel/domain/ports/report-lookup.port';

export const NOTION_REPORT = Symbol('NOTION_REPORT');

export interface NotionReportPort {
  /** 이슈 페이지의 회의록 앵커에 회의록을 멱등하게 써 넣는다. */
  pushReport(issueId: string, report: FinalizedReport): Promise<void>;
}
