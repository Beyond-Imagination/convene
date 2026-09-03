import type {
  ReportDetailResponse,
  ReportListResponse,
  ReportSortOption,
} from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';
import { ApiError } from './errors';
import { ttlCache } from './ttl-cache';

const REPORT_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

export class ReportsApiError extends ApiError {
  // minify-safe: 하위 클래스도 자기 name을 하드코딩(상속받은 'ApiError'를 덮어씀).
  readonly name = 'ReportsApiError';
}

/**
 * 회의록은 회의가 끝나는 순간에만 바뀌므로 같은 조건의 목록 요청은 캐시로 흡수한다.
 * 그 사이 새로 끝난 회의는 `refresh` 또는 새로고침으로만 보인다.
 */
const listCache = ttlCache<ReportListResponse>(REPORT_LIST_CACHE_TTL_MS);

export interface ListReportsParams {
  readonly page?: number;
  readonly size?: number;
  readonly sort?: ReportSortOption;
}

export interface ListReportsOptions {
  /** 캐시를 버리고 새로 받아온다. */
  readonly refresh?: boolean;
}

/** 미지정 파라미터는 보내지 않고 backend 기본값에 맡긴다. */
function listReportsUrl(params?: ListReportsParams): string {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.size !== undefined) query.set('size', String(params.size));
  if (params?.sort !== undefined) query.set('sort', params.sort);
  const queryString = query.toString();
  return `${API_BASE_URL}/reports${queryString === '' ? '' : `?${queryString}`}`;
}

async function requestReportList(url: string): Promise<ReportListResponse> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ReportsApiError(res.status, text || `GET /reports failed (${res.status})`);
  }
  return (await res.json()) as ReportListResponse;
}

/** 목록이 바뀐 걸 아는 쪽에서 캐시를 통째로 버린다. */
export function invalidateReportListCache(): void {
  listCache.invalidate();
}

export async function listReports(
  params?: ListReportsParams,
  options?: ListReportsOptions,
): Promise<ReportListResponse> {
  const url = listReportsUrl(params);
  if (options?.refresh === true) listCache.invalidate(url);
  return listCache.fetch(url, () => requestReportList(url));
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
