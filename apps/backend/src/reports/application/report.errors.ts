/**
 * Reports bounded context의 application/도메인 에러.
 *
 * NestJS 의존성은 두지 않는다(framework-free). Interface layer가 본 에러를
 * NestJS HttpException(`NotFoundException` 등)으로 매핑한다.
 */

export class ReportNotFoundError extends Error {
  constructor(public readonly reportId: string) {
    super(`Report "${reportId}" not found`);
    this.name = 'ReportNotFoundError';
  }
}
