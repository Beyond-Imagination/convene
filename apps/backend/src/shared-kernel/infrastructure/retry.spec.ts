import { isRetryableHttpStatus, RETRY_MAX_DELAY_MS, retryDelayMs, withRetry } from './retry';

describe('retryDelayMs', () => {
  it('재시도가 거듭될수록 대기 상한이 2배씩 늘어난다', () => {
    expect(retryDelayMs(1, 500, () => 1)).toBe(500);
    expect(retryDelayMs(2, 500, () => 1)).toBe(1_000);
    expect(retryDelayMs(3, 500, () => 1)).toBe(2_000);
  });

  it('jitter로 상한의 절반에서 상한 사이를 흔든다', () => {
    expect(retryDelayMs(1, 500, () => 0)).toBe(250);
    expect(retryDelayMs(1, 500, () => 0.5)).toBe(375);
  });

  it('아무리 커져도 상한을 넘지 않는다', () => {
    expect(retryDelayMs(100, 500, () => 1)).toBe(RETRY_MAX_DELAY_MS);
  });
});

describe('isRetryableHttpStatus', () => {
  it('타임아웃·rate limit·서버 오류는 다시 보낼 가치가 있다', () => {
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
  });

  it('요청·인증 문제는 몇 번을 보내도 같으므로 재시도 대상이 아니다', () => {
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(403)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
  });
});

describe('withRetry', () => {
  // baseDelayMs=0이면 백오프 대기가 0ms라 재시도 동작만 빠르게 검증할 수 있다.
  const policy = { maxAttempts: 3, baseDelayMs: 0, isRetryable: (): boolean => true };

  it('처음 성공하면 한 번만 호출한다', async () => {
    const attempt = jest.fn().mockResolvedValue('ok');

    expect(await withRetry(policy, attempt)).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('실패 뒤 성공하면 그 결과를 돌려준다', async () => {
    const attempt = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

    expect(await withRetry(policy, attempt)).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('isRetryable이 false면 재시도하지 않고 즉시 전파한다', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(withRetry({ ...policy, isRetryable: () => false }, attempt)).rejects.toThrow(
      /boom/,
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('maxAttempts 만큼만 시도하고 마지막 에러를 전파한다', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(withRetry(policy, attempt)).rejects.toThrow(/boom/);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('maxAttempts=1이면 재시도하지 않는다', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(withRetry({ ...policy, maxAttempts: 1 }, attempt)).rejects.toThrow();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('재시도 직전에 onRetry로 시도 번호·대기 시간·원인을 알린다', async () => {
    const error = new Error('boom');
    const attempt = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok');
    const onRetry = jest.fn();

    await withRetry({ ...policy, onRetry }, attempt);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, 0, error);
  });

  it('재시도 전에 백오프만큼 실제로 기다린다', async () => {
    const attempt = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

    const startedAt = Date.now();
    await withRetry({ ...policy, baseDelayMs: 60 }, attempt);
    // jitter가 걸리므로 정확한 값이 아니라 하한(상한의 절반)만 단언한다.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
  });
});
