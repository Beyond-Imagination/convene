import {
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MAX_ATTEMPTS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_RETRY_BASE_DELAY_MS,
  DEFAULT_GEMINI_TIMEOUT_MS,
  resolveGeminiConfig,
} from './gemini.config';

describe('resolveGeminiConfig', () => {
  it('GEMINI_API_KEY가 없으면 null을 돌려준다(Noop fallback 신호)', () => {
    expect(resolveGeminiConfig({})).toBeNull();
    expect(resolveGeminiConfig({ GEMINI_API_KEY: '' })).toBeNull();
    expect(resolveGeminiConfig({ GEMINI_API_KEY: '   ' })).toBeNull();
  });

  it('GEMINI_API_KEY만 있으면 모델·타임아웃·재시도 옵션은 디폴트로 채운다', () => {
    expect(resolveGeminiConfig({ GEMINI_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      model: DEFAULT_GEMINI_MODEL,
      timeoutMs: DEFAULT_GEMINI_TIMEOUT_MS,
      baseUrl: DEFAULT_GEMINI_BASE_URL,
      maxAttempts: DEFAULT_GEMINI_MAX_ATTEMPTS,
      retryBaseDelayMs: DEFAULT_GEMINI_RETRY_BASE_DELAY_MS,
    });
  });

  it('모델·타임아웃·baseUrl·재시도 환경변수를 적용한다', () => {
    expect(
      resolveGeminiConfig({
        GEMINI_API_KEY: 'k',
        GEMINI_MODEL: 'gemini-1.5-pro',
        GEMINI_TIMEOUT_MS: '15000',
        GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/',
        GEMINI_MAX_ATTEMPTS: '5',
        GEMINI_RETRY_BASE_DELAY_MS: '200',
      }),
    ).toEqual({
      apiKey: 'k',
      model: 'gemini-1.5-pro',
      timeoutMs: 15000,
      baseUrl: 'https://generativelanguage.googleapis.com',
      maxAttempts: 5,
      retryBaseDelayMs: 200,
    });
  });

  it('GEMINI_MAX_ATTEMPTS=1이면 재시도 없음으로 해석한다', () => {
    expect(
      resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_MAX_ATTEMPTS: '1' })?.maxAttempts,
    ).toBe(1);
  });

  it('GEMINI_MAX_ATTEMPTS / GEMINI_RETRY_BASE_DELAY_MS가 양의 정수가 아니면 throw', () => {
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_MAX_ATTEMPTS: '0' })).toThrow(
      /GEMINI_MAX_ATTEMPTS/,
    );
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_MAX_ATTEMPTS: '2.5' })).toThrow(
      /GEMINI_MAX_ATTEMPTS/,
    );
    expect(() =>
      resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_RETRY_BASE_DELAY_MS: '-1' }),
    ).toThrow(/GEMINI_RETRY_BASE_DELAY_MS/);
  });

  it('GEMINI_TIMEOUT_MS가 양의 정수가 아니면 throw', () => {
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_TIMEOUT_MS: '0' })).toThrow(
      /GEMINI_TIMEOUT_MS/,
    );
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_TIMEOUT_MS: '-5' })).toThrow(
      /GEMINI_TIMEOUT_MS/,
    );
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_TIMEOUT_MS: 'abc' })).toThrow(
      /GEMINI_TIMEOUT_MS/,
    );
    expect(() => resolveGeminiConfig({ GEMINI_API_KEY: 'k', GEMINI_TIMEOUT_MS: '1.5' })).toThrow(
      /GEMINI_TIMEOUT_MS/,
    );
  });

  it('GEMINI_BASE_URL이 http(s) 스킴이 아니면 throw', () => {
    expect(() =>
      resolveGeminiConfig({
        GEMINI_API_KEY: 'k',
        GEMINI_BASE_URL: 'ftp://x',
      }),
    ).toThrow(/GEMINI_BASE_URL/);
  });
});
