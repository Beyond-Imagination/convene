import type { BugReportRequest } from '@convene/shared-interfaces';

import { ApiError } from './errors';

export class BugReportApiError extends ApiError {
  readonly name = 'BugReportApiError';
}

export async function uploadBugReportImage(_file: File): Promise<string> {
  throw new Error('not implemented');
}

export async function submitBugReport(_request: BugReportRequest): Promise<void> {
  throw new Error('not implemented');
}
