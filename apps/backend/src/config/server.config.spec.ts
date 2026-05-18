import {
  DEFAULT_CORS_ORIGIN,
  DEFAULT_PORT,
  resolveCorsOrigins,
  resolvePort,
} from './server.config';

describe('resolvePort', () => {
  it('PORT 가 없으면 DEFAULT_PORT 를 돌려준다', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });

  it('PORT 가 빈 문자열이면 DEFAULT_PORT 로 fallback', () => {
    expect(resolvePort({ PORT: '' })).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '   ' })).toBe(DEFAULT_PORT);
  });

  it('PORT 가 유효한 정수면 숫자로 변환한다', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });

  it('PORT 가 정수가 아니면 throw', () => {
    expect(() => resolvePort({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => resolvePort({ PORT: '3.14' })).toThrow(/PORT/);
  });

  it('PORT 가 0 이하 / 65535 초과면 throw', () => {
    expect(() => resolvePort({ PORT: '0' })).toThrow(/PORT/);
    expect(() => resolvePort({ PORT: '-1' })).toThrow(/PORT/);
    expect(() => resolvePort({ PORT: '70000' })).toThrow(/PORT/);
  });
});

describe('resolveCorsOrigins', () => {
  it('CORS_ORIGIN 이 없으면 DEFAULT_CORS_ORIGIN 한 개', () => {
    expect(resolveCorsOrigins({})).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('단일 origin 은 trim 한 결과 한 개를 돌려준다', () => {
    expect(resolveCorsOrigins({ CORS_ORIGIN: '  https://example.com  ' })).toEqual([
      'https://example.com',
    ]);
  });

  it('콤마 구분 여러 origin 을 배열로 돌려준다', () => {
    expect(
      resolveCorsOrigins({
        CORS_ORIGIN: 'https://a.com, https://b.com ,https://c.com',
      }),
    ).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('빈 문자열만 들어 있으면 디폴트 origin 으로 fallback', () => {
    expect(resolveCorsOrigins({ CORS_ORIGIN: ',  , ' })).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('중복 origin 은 제거한다', () => {
    expect(
      resolveCorsOrigins({ CORS_ORIGIN: 'https://a.com, https://a.com' }),
    ).toEqual(['https://a.com']);
  });
});
