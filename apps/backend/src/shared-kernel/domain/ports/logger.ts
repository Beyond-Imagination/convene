export const LOGGER = Symbol('LOGGER');

export type LogContext = Record<string, unknown>;

/**
 * pino 컨벤션을 따른다: 구조화 필드(obj)를 먼저, 사람이 읽는 메시지를 뒤에 받는다.
 * 에러는 `{ err }` 형태로 obj에 담으면 구현체가 stack까지 직렬화한다.
 */
export interface LoggerPort {
  debug(obj: LogContext, message: string): void;
  info(obj: LogContext, message: string): void;
  warn(obj: LogContext, message: string): void;
  error(obj: LogContext, message: string): void;
}
