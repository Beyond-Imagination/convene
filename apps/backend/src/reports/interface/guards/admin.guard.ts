import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

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
  constructor(private readonly token: string | null) {}

  canActivate(context: ExecutionContext): boolean {
    throw new Error('not implemented');
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
