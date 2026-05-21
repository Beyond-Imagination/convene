import {
  DEFAULT_AI_WORKER_BASE_URL,
  resolveAiWorkerBaseUrl,
} from './ai-worker.config';

describe('resolveAiWorkerBaseUrl', () => {
  it('AI_WORKER_BASE_URL 이 없으면 디폴트를 돌려준다', () => {
    expect(resolveAiWorkerBaseUrl({})).toBe(DEFAULT_AI_WORKER_BASE_URL);
  });

  it('AI_WORKER_BASE_URL 이 빈 문자열이면 디폴트로 fallback', () => {
    expect(resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: '' })).toBe(
      DEFAULT_AI_WORKER_BASE_URL,
    );
    expect(resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: '   ' })).toBe(
      DEFAULT_AI_WORKER_BASE_URL,
    );
  });

  it('http:// / https:// URL 을 그대로 돌려준다(끝 슬래시 제거)', () => {
    expect(resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: 'http://ai-worker:8000' })).toBe(
      'http://ai-worker:8000',
    );
    expect(
      resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: 'https://ai.example.com/' }),
    ).toBe('https://ai.example.com');
  });

  it('http:// / https:// 스킴이 아니면 throw', () => {
    expect(() => resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: 'ai-worker:8000' })).toThrow(
      /AI_WORKER_BASE_URL/,
    );
    expect(() => resolveAiWorkerBaseUrl({ AI_WORKER_BASE_URL: 'ftp://x' })).toThrow(
      /AI_WORKER_BASE_URL/,
    );
  });
});
