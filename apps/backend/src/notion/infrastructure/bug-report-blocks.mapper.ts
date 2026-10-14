import { BugReport } from '@/notion/domain/ports/notion-bug-report.port';

export function buildBugReportPage(_report: BugReport): {
  readonly title: string;
  readonly children: ReadonlyArray<{ type: string } & Record<string, unknown>>;
} {
  throw new Error('not implemented');
}
