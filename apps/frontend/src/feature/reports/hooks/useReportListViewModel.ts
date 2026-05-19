'use client';

import type { ReportListItem } from '@migration/shared-interfaces';

/**
 * /reports 회의록 목록 페이지의 ViewModel — spec 단계 stub.
 * 실제 fetch + 상태 머신은 후속 커밋에서 채운다.
 */

export type ReportListStatus = 'loading' | 'loaded' | 'error';

export interface UseReportListViewModel {
  readonly status: ReportListStatus;
  readonly items: ReadonlyArray<ReportListItem>;
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
}

export function useReportListViewModel(): UseReportListViewModel {
  throw new Error('not implemented');
}
