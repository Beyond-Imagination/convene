import { FinalizedReport } from '@/shared-kernel/domain/ports';

export interface ReportBlocks {
  /** 회의록 전체를 감싸는 toggle. children 없이 먼저 append하고 id를 받는다. */
  readonly wrapper: Record<string, unknown>;
  readonly children: ReadonlyArray<Record<string, unknown>>;
}

export function toReportBlocks(_report: FinalizedReport): ReportBlocks {
  throw new Error('not implemented');
}
