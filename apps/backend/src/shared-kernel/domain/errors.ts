/**
 * 도메인/애플리케이션 계층이 던지는 **예상된** 오류의 루트.
 *
 * 각 에러가 매핑될 HTTP status를 스스로 선언한다.
 * 예상 못 한 결함(인프라 장애 등)은 raw Error로 두어 500으로 표면화된다.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}

/** 대상 리소스를 찾지 못함. */
export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
}

/** 권한 없음. */
export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
}

/** 현재 상태와 충돌(중복/허용되지 않는 상태 전이 등). */
export class ConflictError extends DomainError {
  readonly httpStatus = 409;
}
