import type {
  ReportDetailResponse,
  ReportListItem,
  ReportListResponse,
} from '@migration/shared-interfaces';

import { API_BASE_URL } from './config';

/**
 * Reports bounded context 의 HTTP API client (Model 레이어) — spec 단계 stub.
 * 실제 fetch 구현은 후속 커밋에서 채운다.
 */
export class ReportsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ReportsApiError';
  }
}

export interface ListReportsParams {
  readonly limit?: number;
}

export async function listReports(_params?: ListReportsParams): Promise<ReportListItem[]> {
  throw new Error('not implemented');
}

export async function getReport(_id: string): Promise<ReportDetailResponse> {
  throw new Error('not implemented');
}

// API_BASE_URL 은 impl 단계에서 사용한다.
void API_BASE_URL;
void ({} as ReportListResponse);
