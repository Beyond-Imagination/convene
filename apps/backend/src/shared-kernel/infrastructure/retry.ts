/**
 * 외부 API 호출의 일시적 실패를 지수 백오프로 재시도한다.
 *
 * 무엇이 "일시적"인지는 호출부가 정한다 — 어댑터마다 에러 타입이 다르기 때문이다.
 */

export const RETRY_MAX_DELAY_MS = 8_000;

export interface RetryPolicy {
  /** 첫 호출 포함 총 시도 횟수. 1이면 재시도 없음. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  /** 다시 호출하면 결과가 달라질 수 있는 실패인지 판정한다. */
  readonly isRetryable: (error: unknown) => boolean;
  readonly onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * 재시도 대기 시간. 시도마다 2배로 늘리되 상한에서 멈추고, 상한의 절반~상한 사이에서 jitter를 준다.
 * `attempt`는 방금 실패한 시도 번호(1부터).
 */
export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  const half = ceiling / 2;
  return Math.floor(half + random() * half);
}

/** 요청이 잘못됐거나 권한이 없는 경우(4xx)는 몇 번을 보내도 같은 응답이 온다. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function withRetry<T>(policy: RetryPolicy, attempt: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (error) {
      if (n >= policy.maxAttempts || !policy.isRetryable(error)) throw error;

      const delayMs = retryDelayMs(n, policy.baseDelayMs);
      policy.onRetry?.(n, delayMs, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
