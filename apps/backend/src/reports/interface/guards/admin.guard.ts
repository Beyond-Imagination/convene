import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

export const ADMIN_API_TOKEN = Symbol('ADMIN_API_TOKEN');

/**
 * 관리자 전용 엔드포인트(회의록 재요약 등)를 단일 운영자 시크릿으로 보호하는 Guard.
 *
 * `Authorization: Bearer <ADMIN_API_TOKEN>` 헤더를 검증한다.
 * - 서버에 토큰이 설정돼 있지 않으면(`token === null`) 엔드포인트 자체를 비활성으로 보고 403으로 막는다.
 * - 토큰은 있으나 요청 헤더가 없거나 일치하지 않으면 401.
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

/**
 * 타이밍 공격을 막기 위한 상수 시간 토큰 비교.
 *
 * 두 토큰을 먼저 SHA-256(고정 32바이트)으로 해시한 뒤 비교한다.
 * 길이가 다른 입력에서도 항상 같은 길이 버퍼를 비교하므로 timingSafeEqual 예외를 피하고, 길이 차이로 토큰 길이가 노출되는 타이밍 누출도 없앤다.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
