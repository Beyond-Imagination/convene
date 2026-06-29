import { DEFAULT_LOG_LEVEL, isPrettyLoggingEnabled, resolveLogLevel } from './logger.config';

describe('resolveLogLevel', () => {
  it('LOG_LEVEL이 없으면 DEFAULT_LOG_LEVEL을 돌려준다', () => {
    expect(resolveLogLevel({})).toBe(DEFAULT_LOG_LEVEL);
  });

  it('빈 문자열이면 DEFAULT_LOG_LEVEL로 fallback', () => {
    expect(resolveLogLevel({ LOG_LEVEL: '' })).toBe(DEFAULT_LOG_LEVEL);
    expect(resolveLogLevel({ LOG_LEVEL: '   ' })).toBe(DEFAULT_LOG_LEVEL);
  });

  it('유효한 레벨은 소문자로 정규화해 돌려준다', () => {
    expect(resolveLogLevel({ LOG_LEVEL: 'DEBUG' })).toBe('debug');
    expect(resolveLogLevel({ LOG_LEVEL: 'warn' })).toBe('warn');
  });

  it('유효하지 않은 레벨이면 throw', () => {
    expect(() => resolveLogLevel({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
    expect(() => resolveLogLevel({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});

describe('isPrettyLoggingEnabled', () => {
  it('기본은 JSON(false) — pino-pretty 미설치 환경에서도 안전', () => {
    expect(isPrettyLoggingEnabled({})).toBe(false);
    expect(isPrettyLoggingEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isPrettyLoggingEnabled({ LOG_PRETTY: 'false' })).toBe(false);
  });

  it('비-production에서 LOG_PRETTY=true면 pretty', () => {
    expect(isPrettyLoggingEnabled({ LOG_PRETTY: 'true' })).toBe(true);
  });

  it('production이면 LOG_PRETTY=true여도 JSON 유지', () => {
    expect(isPrettyLoggingEnabled({ NODE_ENV: 'production', LOG_PRETTY: 'true' })).toBe(false);
  });
});
