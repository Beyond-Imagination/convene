import type { BugReportImageUploadResponse, BugReportRequest } from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';
import { ApiError } from './errors';

export class BugReportApiError extends ApiError {
  // minify-safe: 하위 클래스도 자기 name을 하드코딩(상속받은 'ApiError'를 덮어씀).
  readonly name = 'BugReportApiError';
}

const fail = async (res: Response, label: string): Promise<never> => {
  const text = await res.text().catch(() => '');
  throw new BugReportApiError(res.status, text || `${label} failed (${res.status})`);
};

/** 이미지는 본문보다 먼저 한 장씩 올린다. 돌려받은 id 를 본문에 싣는다. */
export async function uploadBugReportImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${API_BASE_URL}/bug-reports/images`, { method: 'POST', body: form });
  if (!res.ok) return fail(res, 'POST /bug-reports/images');
  return ((await res.json()) as BugReportImageUploadResponse).uploadId;
}

export async function submitBugReport(request: BugReportRequest): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/bug-reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) await fail(res, 'POST /bug-reports');
}
