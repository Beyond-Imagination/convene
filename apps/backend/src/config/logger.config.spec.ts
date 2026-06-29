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
  it('production이면 false (JSON 출력 유지)', () => {
    expect(isPrettyLoggingEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('production이 아니면 기본 true', () => {
    expect(isPrettyLoggingEnabled({})).toBe(true);
    expect(isPrettyLoggingEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('LOG_PRETTY=false면 비-production에서도 false', () => {
    expect(isPrettyLoggingEnabled({ LOG_PRETTY: 'false' })).toBe(false);
  });
});
