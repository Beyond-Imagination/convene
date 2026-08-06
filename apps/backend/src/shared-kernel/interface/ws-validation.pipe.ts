import { ValidationPipe } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

/**
 * WS gateway 공통 ValidationPipe.
 *
 * HTTP BadRequestException은 Nest 기본 WsExceptionFilter에 의해 'Internal server error'로 가려져 client에 검증 정보가 전달되지 않는다.
 * WsException으로 명시 변환해 어떤 필드가 잘못됐는지 노출한다.
 * 페이로드의 status: 'error'는 NestJS 기본 fallback 포맷과 동일한 컨벤션.
 */
export function wsValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException({
        status: 'error',
        message: 'validation failed',
        errors: errors.map((e) => ({
          property: e.property,
          constraints: e.constraints,
        })),
      }),
  });
}
