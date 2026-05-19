'use client';

import type { ReportDetailResponse } from '@migration/shared-interfaces';

/**
 * /reports/[id] 회의록 상세 페이지의 ViewModel — spec 단계 stub.
 */
export type ReportDetailStatus = 'idle' | 'loading' | 'loaded' | 'not-found' | 'error';

export interface UseReportDetailViewModel {
  readonly status: ReportDetailStatus;
  readonly report: ReportDetailResponse | null;
  readonly errorMessage: string | null;
}

export function useReportDetailViewModel(_id: string): UseReportDetailViewModel {
  throw new Error('not implemented');
}
