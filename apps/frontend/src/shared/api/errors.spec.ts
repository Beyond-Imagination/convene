import { describe, expect, it } from 'vitest';

import { ApiError } from './errors';

describe('ApiError', () => {
  it('status·message를 보유하고 name이 클래스명으로 설정된다', () => {
    const e = new ApiError(404, 'not found');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
    expect(e.message).toBe('not found');
    expect(e.name).toBe('ApiError');
  });

  it('하위 client 에러는 ApiError로 식별되며 name 하드코딩 시 그 값을 가진다(minify-safe)', () => {
    class MeetingApiError extends ApiError {
      readonly name = 'MeetingApiError';
    }
    const e = new MeetingApiError(403, 'forbidden');
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(403);
    expect(e.name).toBe('MeetingApiError');
  });
});
