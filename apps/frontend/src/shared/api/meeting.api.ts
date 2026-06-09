import type {
  CloseMeetingResponse,
  CreateMeetingRequest,
  CreateMeetingResponse,
} from '@convene/shared-interfaces';

import { API_BASE_URL } from './config';

export class MeetingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MeetingApiError';
  }
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
