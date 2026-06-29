const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * `LOG_LEVEL` 환경변수를 pino 레벨로 변환한다.
 * 미설정/공백이면 DEFAULT_LOG_LEVEL, 유효하지 않은 값이면 throw.
 */
export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = env.LOG_LEVEL?.trim().toLowerCase();
  if (!raw) return DEFAULT_LOG_LEVEL;
  if (!isLogLevel(raw)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}: "${env.LOG_LEVEL}"`);
  }
  return raw;
}

/**
 * pino-pretty(사람이 읽는 컬러 출력) 사용 여부.
 * pino-pretty는 devDependency라 prod 이미지엔 없으므로, 기본은 JSON(opt-out 아닌 opt-in).
 * production은 항상 JSON, 그 외 환경에서 `LOG_PRETTY=true`일 때만 pretty.
 */
export function isPrettyLoggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.LOG_PRETTY === 'true';
}
