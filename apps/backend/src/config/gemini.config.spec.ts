import {
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  resolveGeminiConfig,
} from './gemini.config';

describe('resolveGeminiConfig', () => {
  it('GEMINI_API_KEY가 없으면 null을 돌려준다(Noop fallback 신호)', () => {
    expect(resolveGeminiConfig({})).toBeNull();
    expect(resolveGeminiConfig({ GEMINI_API_KEY: '' })).toBeNull();
    expect(resolveGeminiConfig({ GEMINI_API_KEY: '   ' })).toBeNull();
  });

  it('GEMINI_API_KEY만 있으면 model/timeout/baseUrl은 디폴트로 채운다', () => {
    expect(resolveGeminiConfig({ GEMINI_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      model: DEFAULT_GEMINI_MODEL,
      timeoutMs: DEFAULT_GEMINI_TIMEOUT_MS,
      baseUrl: DEFAULT_GEMINI_BASE_URL,
    });
  });

  it('GEMINI_MODEL / GEMINI_TIMEOUT_MS / GEMINI_BASE_URL을 적용한다', () => {
    expect(
      resolveGeminiConfig({
        GEMINI_API_KEY: 'k',
        GEMINI_MODEL: 'gemini-1.5-pro',
        GEMINI_TIMEOUT_MS: '15000',
        GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/',
      }),
    ).toEqual({
      apiKey: 'k',
      model: 'gemini-1.5-pro',
      timeoutMs: 15000,
      baseUrl: 'https://generativelanguage.googleapis.com',
    });
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
