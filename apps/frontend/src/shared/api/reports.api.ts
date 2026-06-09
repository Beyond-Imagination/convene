import type {
  ReportDetailResponse,
  ReportListItem,
  ReportListResponse,
} from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';

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

export async function listReports(params?: ListReportsParams): Promise<ReportListItem[]> {
  const url =
    params?.limit !== undefined
      ? `${API_BASE_URL}/reports?limit=${encodeURIComponent(String(params.limit))}`
      : `${API_BASE_URL}/reports`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ReportsApiError(res.status, text || `GET /reports failed (${res.status})`);
  }
  const body = (await res.json()) as ReportListResponse;
  return body.items;
}

export async function getReport(id: string): Promise<ReportDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/reports/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ReportsApiError(res.status, text || `GET /reports/${id} failed (${res.status})`);
  }
  return (await res.json()) as ReportDetailResponse;
}
