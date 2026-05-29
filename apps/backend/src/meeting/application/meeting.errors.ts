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

/**
 * 회의 종료를 host 가 아닌 요청자가 시도했을 때. Interface layer 가
 * `ForbiddenException`(403)으로 매핑한다.
 */
export class NotHostError extends Error {
  constructor(public readonly code: string) {
    super(`Only the host can close meeting "${code}"`);
    this.name = 'NotHostError';
  }
}
