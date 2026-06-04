import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * AdminGuard 가 주입받는 관리자 토큰 값의 DI 토큰.
 * ReportsModule 이 `resolveAdminConfig()` 결과(token | null)를 이 토큰으로 제공한다.
 */
export const ADMIN_API_TOKEN = Symbol('ADMIN_API_TOKEN');

/**
 * 관리자 전용 엔드포인트(회의록 재요약 등)를 단일 운영자 시크릿으로 보호하는 Guard.
 *
 * `Authorization: Bearer <ADMIN_API_TOKEN>` 헤더를 검증한다.
 * - 서버에 토큰이 설정돼 있지 않으면(`token === null`) 엔드포인트 자체를 비활성으로
 *   보고 403 으로 막는다(실수로 무방비 노출 방지).
 * - 토큰은 있으나 요청 헤더가 없거나 일치하지 않으면 401.
 *
 * 토큰 값은 `resolveAdminConfig` 가 env 에서 읽어 주입한다(ReportsModule useFactory).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(ADMIN_API_TOKEN) private readonly token: string | null) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.token === null) {
      throw new ForbiddenException(
        '관리자 엔드포인트가 비활성화되어 있습니다(ADMIN_API_TOKEN 미설정).',
      );
    }
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const provided = extractBearerToken(request.headers.authorization);
    if (provided === null || !safeTokenEqual(provided, this.token)) {
      throw new UnauthorizedException('유효한 관리자 토큰이 필요합니다.');
    }
    return true;
  }
}

/** `Authorization: Bearer <token>` 헤더에서 토큰만 추출한다. 형식이 아니면 null. */
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** 길이 노출/타이밍 공격을 줄이기 위한 상수 시간 비교. */
export function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
