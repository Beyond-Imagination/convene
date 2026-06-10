import { ArgumentsHost } from '@nestjs/common';

import { ConflictError, DomainError, ForbiddenError, NotFoundError } from '@/shared-kernel/domain/errors';

import { DomainExceptionFilter } from './domain-exception.filter';

/** status().json() 체이닝을 기록하는 fake HTTP response. */
const makeHttpHost = () => {
  const captured: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return {
        json(body: unknown) {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, captured };
};

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new NotFoundError('없음'), 404],
    [new ForbiddenError('권한 없음'), 403],
    [new ConflictError('충돌'), 409],
  ])('도메인 에러의 httpStatus로 응답을 매핑한다 (%s)', (error, status) => {
    const { host, captured } = makeHttpHost();
    filter.catch(error, host);
    expect(captured.status).toBe(status);
    expect(captured.body).toMatchObject({ statusCode: status, message: error.message });
  });

  it('새 에러가 보유한 httpStatus를 그대로 사용한다(필터 변경·매핑 테이블 없음)', () => {
    class TeapotError extends DomainError {
      readonly httpStatus = 418;
    }
    const { host, captured } = makeHttpHost();
    filter.catch(new TeapotError('teapot'), host);
    expect(captured.status).toBe(418);
  });

  it('비-HTTP 컨텍스트에서는 가로채지 않고 그대로 throw 한다(gateway가 처리)', () => {
    const host = { getType: () => 'ws' } as unknown as ArgumentsHost;
    const error = new NotFoundError('ws');
    expect(() => filter.catch(error, host)).toThrow(error);
  });
});
