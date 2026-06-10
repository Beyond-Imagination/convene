import { ConflictError, DomainError, ForbiddenError, NotFoundError } from './errors';

describe('도메인 에러 계층', () => {
  it('의미 base는 DomainError이자 Error로 식별되고 name이 클래스명으로 설정된다', () => {
    const e = new NotFoundError('없음');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(DomainError);
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.name).toBe('NotFoundError');
    expect(e.message).toBe('없음');
  });

  it('구체 하위 에러는 자기 클래스명을 name으로 가지며 해당 의미 base로 식별된다', () => {
    class MeetingNotFoundError extends NotFoundError {
      constructor(public readonly code: string) {
        super(`Meeting "${code}" not found`);
      }
    }
    const e = new MeetingNotFoundError('abc12xyz');
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e).toBeInstanceOf(DomainError);
    expect(e.name).toBe('MeetingNotFoundError');
    expect(e.code).toBe('abc12xyz');
  });

  it('서로 다른 의미 base는 교차 식별되지 않는다', () => {
    expect(new ForbiddenError('x')).not.toBeInstanceOf(NotFoundError);
    expect(new ConflictError('x')).not.toBeInstanceOf(ForbiddenError);
  });

  it('각 의미 base는 매핑될 HTTP status를 스스로 보유한다', () => {
    expect(new NotFoundError('x').httpStatus).toBe(404);
    expect(new ForbiddenError('x').httpStatus).toBe(403);
    expect(new ConflictError('x').httpStatus).toBe(409);
  });
});
