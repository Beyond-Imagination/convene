import type {
  CloseMeetingResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
  MeetingDetailResponse,
  NicknameAvailabilityResponse,
} from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';
import { ApiError } from './errors';

export class MeetingApiError extends ApiError {
  // minify-safe: 하위 클래스도 자기 name을 하드코딩(상속받은 'ApiError'를 덮어씀).
  readonly name = 'MeetingApiError';
}

export async function createMeeting(input: CreateMeetingRequest): Promise<CreateMeetingResponse> {
  const res = await fetch(`${API_BASE_URL}/meetings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(res.status, text || `POST /meetings failed (${res.status})`);
  }
  return (await res.json()) as CreateMeetingResponse;
}

export async function getMeeting(code: string): Promise<MeetingDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/meetings/${encodeURIComponent(code)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(res.status, text || `GET /meetings/${code} failed (${res.status})`);
  }
  return (await res.json()) as MeetingDetailResponse;
}

export async function checkNicknameAvailability(
  code: string,
  nickname: string,
  participantId?: string,
): Promise<NicknameAvailabilityResponse> {
  const params = new URLSearchParams({ nickname });
  if (participantId !== undefined) params.set('participantId', participantId);
  const res = await fetch(
    `${API_BASE_URL}/meetings/${encodeURIComponent(code)}/nickname-availability?${params}`,
    { method: 'GET' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(res.status, text || `닉네임 확인 실패 (${res.status})`);
  }
  return (await res.json()) as NicknameAvailabilityResponse;
}

export async function closeMeeting(
  code: string,
  hostToken?: string,
): Promise<CloseMeetingResponse> {
  const res = await fetch(`${API_BASE_URL}/meetings/${code}`, {
    method: 'DELETE',
    headers: hostToken ? { 'x-host-token': hostToken } : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MeetingApiError(
      res.status,
      text || `DELETE /meetings/${code} failed (${res.status})`,
    );
  }
  return (await res.json()) as CloseMeetingResponse;
}
