import type {
  CloseMeetingResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
} from '@migration/shared-interfaces';

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

/**
 * 회의를 명시적으로 종료한다(수동 종료, reason='manual').
 * 성공 시 backend 는 `meeting.ended` 도메인 이벤트를 발행하고 회의록 생성
 * 파이프라인이 트리거된다.
 *
 * `hostToken` 은 회의 생성자만 보유하며, backend 가 이를 검증해 host 가 아니면
 * 403(ForbiddenException) 으로 거부한다. 토큰이 없으면 쿼리를 붙이지 않는다.
 */
export async function closeMeeting(
  code: string,
  hostToken?: string,
): Promise<CloseMeetingResponse> {
  const query = hostToken ? `?hostToken=${encodeURIComponent(hostToken)}` : '';
  const res = await fetch(`${API_BASE_URL}/meetings/${code}${query}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(
      res.status,
      text || `DELETE /meetings/${code} failed (${res.status})`,
    );
  }
  return (await res.json()) as CloseMeetingResponse;
}
