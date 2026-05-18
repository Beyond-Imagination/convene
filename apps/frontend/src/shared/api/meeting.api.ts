import type { CreateMeetingRequest, CreateMeetingResponse } from '@migration/shared-interfaces';

import { API_BASE_URL } from './config';

/**
 * Meeting bounded context 의 HTTP API client (Model 레이어).
 *
 * View / ViewModel 은 본 모듈 외 fetch 를 직접 호출하지 않는다(ARCHITECTURE §4).
 * 비-2xx 응답은 `MeetingApiError` 로 일관되게 던져 ViewModel 이 분기 처리한다.
 */
export class MeetingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MeetingApiError';
  }
}

export async function createMeeting(
  input: CreateMeetingRequest,
): Promise<CreateMeetingResponse> {
  const res = await fetch(`${API_BASE_URL}/meetings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(
      res.status,
      text || `POST /meetings failed (${res.status})`,
    );
  }
  return (await res.json()) as CreateMeetingResponse;
}
