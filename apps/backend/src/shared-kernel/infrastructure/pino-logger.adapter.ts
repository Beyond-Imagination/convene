import { Inject, Injectable, Scope } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

/** pino 컨벤션: 구조화 필드(obj)를 먼저, 사람이 읽는 메시지를 뒤에. 에러는 `{ err }`로 담으면 stack까지 직렬화된다. */
export type LogContext = Record<string, unknown>;

/**
 * 애플리케이션 로거. pino(nestjs-pino) 위에 얹는다.
 *
 * PinoLogger는 singleton이라 setContext 대신 호출별 병합으로 서비스마다 독립적인 context를 보장한다.
 * context는 INQUIRER(주입 지점 클래스)에서 읽으므로 주입하는 쪽이 클래스명을 넘길 필요가 없다.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class PinoLoggerAdapter {
  private readonly context: string;

  constructor(
    private readonly logger: PinoLogger,
    @Inject(INQUIRER) inquirer: object | string | undefined,
  ) {
    this.context =
      typeof inquirer === 'string' ? inquirer : (inquirer?.constructor?.name ?? 'Application');
  }

  debug(obj: LogContext, message: string): void {
    this.logger.debug({ ...obj, context: this.context }, message);
  }

  info(obj: LogContext, message: string): void {
    this.logger.info({ ...obj, context: this.context }, message);
  }

  warn(obj: LogContext, message: string): void {
    this.logger.warn({ ...obj, context: this.context }, message);
  }

  error(obj: LogContext, message: string): void {
    this.logger.error({ ...obj, context: this.context }, message);
  }
}
