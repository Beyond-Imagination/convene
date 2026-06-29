import { PinoLogger } from 'nestjs-pino';

import type { LogContext, LoggerPort } from '@/shared-kernel/domain/ports';

/**
 * LoggerPort의 production 어댑터.
 *
 * PinoLogger는 singleton이라 setContext 대신 호출별 병합으로 서비스마다 독립적인 context를 보장한다.
 */
export class PinoLoggerAdapter implements LoggerPort {
  constructor(
    private readonly logger: PinoLogger,
    private readonly context: string,
  ) {}

  debug(obj: LogContext, message: string): void {
    this.logger.debug({ context: this.context, ...obj }, message);
  }

  info(obj: LogContext, message: string): void {
    this.logger.info({ context: this.context, ...obj }, message);
  }

  warn(obj: LogContext, message: string): void {
    this.logger.warn({ context: this.context, ...obj }, message);
  }

  error(obj: LogContext, message: string): void {
    this.logger.error({ context: this.context, ...obj }, message);
  }
}
