import {
  DEFAULT_AI_WORKER_BASE_URL,
  DEFAULT_AI_WORKER_MAX_ATTEMPTS,
  DEFAULT_AI_WORKER_RETRY_BASE_DELAY_MS,
  resolveAiWorkerConfig,
} from './ai-worker.config';

describe('resolveAiWorkerConfig', () => {
  it('환경변수가 없으면 base URL·재시도 옵션 모두 디폴트다', () => {
    expect(resolveAiWorkerConfig({})).toEqual({
      baseUrl: DEFAULT_AI_WORKER_BASE_URL,
      maxAttempts: DEFAULT_AI_WORKER_MAX_ATTEMPTS,
      retryBaseDelayMs: DEFAULT_AI_WORKER_RETRY_BASE_DELAY_MS,
    });
  });

  it('AI_WORKER_BASE_URL이 빈 문자열이면 디폴트로 fallback', () => {
    expect(resolveAiWorkerConfig({ AI_WORKER_BASE_URL: '' }).baseUrl).toBe(
      DEFAULT_AI_WORKER_BASE_URL,
    );
    expect(resolveAiWorkerConfig({ AI_WORKER_BASE_URL: '   ' }).baseUrl).toBe(
      DEFAULT_AI_WORKER_BASE_URL,
    );
  });

  it('http:// / https:// URL을 그대로 돌려준다(끝 슬래시 제거)', () => {
    expect(resolveAiWorkerConfig({ AI_WORKER_BASE_URL: 'http://ai-worker:8000' }).baseUrl).toBe(
      'http://ai-worker:8000',
    );
    expect(resolveAiWorkerConfig({ AI_WORKER_BASE_URL: 'https://ai.example.com/' }).baseUrl).toBe(
      'https://ai.example.com',
    );
  });

  it('http:// / https:// 스킴이 아니면 throw', () => {
    expect(() => resolveAiWorkerConfig({ AI_WORKER_BASE_URL: 'ai-worker:8000' })).toThrow(
      /AI_WORKER_BASE_URL/,
    );
    expect(() => resolveAiWorkerConfig({ AI_WORKER_BASE_URL: 'ftp://x' })).toThrow(
      /AI_WORKER_BASE_URL/,
    );
  });

  it('AI_WORKER_MAX_ATTEMPTS / AI_WORKER_RETRY_BASE_DELAY_MS를 적용한다', () => {
    expect(
      resolveAiWorkerConfig({ AI_WORKER_MAX_ATTEMPTS: '5', AI_WORKER_RETRY_BASE_DELAY_MS: '200' }),
    ).toEqual({
      baseUrl: DEFAULT_AI_WORKER_BASE_URL,
      maxAttempts: 5,
      retryBaseDelayMs: 200,
    });
  });

  it('재시도 옵션이 양의 정수가 아니면 throw', () => {
    expect(() => resolveAiWorkerConfig({ AI_WORKER_MAX_ATTEMPTS: '0' })).toThrow(
      /AI_WORKER_MAX_ATTEMPTS/,
    );
    expect(() => resolveAiWorkerConfig({ AI_WORKER_RETRY_BASE_DELAY_MS: 'abc' })).toThrow(
      /AI_WORKER_RETRY_BASE_DELAY_MS/,
    );
  });
});
