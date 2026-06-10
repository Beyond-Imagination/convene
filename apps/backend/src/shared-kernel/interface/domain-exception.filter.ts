import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

import { DomainError } from '@/shared-kernel/domain/errors';

/**
 * 전 BC 공통: framework-free `DomainError`를 HTTP 응답으로 번역하는 글로벌 필터.
 *
 * 비-HTTP 컨텍스트(WS)는 각 gateway가 자체 처리하므로 여기선 HTTP만 다룬다.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const status = exception.httpStatus;
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    response.status(status).json({ statusCode: status, message: exception.message });
  }
}
