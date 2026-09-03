import type {
  ReportDetailResponse,
  ReportListResponse,
  ReportSortOption,
} from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';
import { ApiError } from './errors';

export class ReportsApiError extends ApiError {
  // minify-safe: 하위 클래스도 자기 name을 하드코딩(상속받은 'ApiError'를 덮어씀).
  readonly name = 'ReportsApiError';
}

export interface ListReportsParams {
  readonly page?: number;
  readonly size?: number;
  readonly sort?: ReportSortOption;
}

/** 미지정 파라미터는 보내지 않고 backend 기본값에 맡긴다. */
export async function listReports(params?: ListReportsParams): Promise<ReportListResponse> {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.size !== undefined) query.set('size', String(params.size));
  if (params?.sort !== undefined) query.set('sort', params.sort);
  const queryString = query.toString();
  const url = `${API_BASE_URL}/reports${queryString === '' ? '' : `?${queryString}`}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ReportsApiError(res.status, text || `GET /reports failed (${res.status})`);
  }
  return (await res.json()) as ReportListResponse;
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
