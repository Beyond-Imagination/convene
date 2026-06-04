import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AdminGuard, extractBearerToken, safeTokenEqual } from './admin.guard';

/** Authorization 헤더만 가진 가짜 HTTP ExecutionContext. */
const contextWithAuth = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization === undefined ? {} : { authorization } }),
    }),
  }) as unknown as ExecutionContext;

describe('extractBearerToken', () => {
  it('Bearer 스킴에서 토큰만 추출한다(대소문자/여백 허용)', () => {
    expect(extractBearerToken('Bearer abc')).toBe('abc');
    expect(extractBearerToken('bearer  abc  ')).toBe('abc');
  });

  it('Bearer 형식이 아니거나 문자열이 아니면 null', () => {
    expect(extractBearerToken('abc')).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(['Bearer abc'])).toBeNull();
  });
});

describe('safeTokenEqual', () => {
  it('같으면 true, 다르거나 길이가 다르면 false', () => {
    expect(safeTokenEqual('secret', 'secret')).toBe(true);
    expect(safeTokenEqual('secret', 'secreT')).toBe(false);
    expect(safeTokenEqual('secret', 'longer-secret')).toBe(false);
  });
});

describe('AdminGuard', () => {
  it('서버에 토큰이 설정돼 있지 않으면 403(엔드포인트 비활성)', () => {
    const guard = new AdminGuard(null);
    expect(() => guard.canActivate(contextWithAuth('Bearer anything'))).toThrow(ForbiddenException);
  });

  it('Authorization 헤더가 없으면 401', () => {
    const guard = new AdminGuard('secret');
    expect(() => guard.canActivate(contextWithAuth())).toThrow(UnauthorizedException);
  });

  it('토큰이 일치하지 않으면 401', () => {
    const guard = new AdminGuard('secret');
    expect(() => guard.canActivate(contextWithAuth('Bearer wrong'))).toThrow(UnauthorizedException);
  });

  it('Bearer 토큰이 일치하면 통과한다', () => {
    const guard = new AdminGuard('secret');
    expect(guard.canActivate(contextWithAuth('Bearer secret'))).toBe(true);
  });
});
