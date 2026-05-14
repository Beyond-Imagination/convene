/**
 * Meeting bounded context의 application/도메인 에러.
 *
 * NestJS 의존성은 두지 않는다(framework-free). Interface layer가 본 에러를
 * NestJS HttpException(`NotFoundException` 등)으로 매핑한다.
 */

export class MeetingNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Meeting "${code}" not found`);
    this.name = 'MeetingNotFoundError';
  }
}
