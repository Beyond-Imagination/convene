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

/**
 * 재요약 대상이 아닌 회의록에 재요약을 요청했을 때 발생한다.
 *
 * 재요약은 1차 요약이 이미 끝난(done/failed) 회의록만 대상으로 한다. summary 가
 * 아직 pending(파이프라인 진행 중)이면 거부한다. Interface layer 가 409 Conflict 로 매핑.
 */
export class ReportNotResummarizableError extends Error {
  constructor(
    public readonly reportId: string,
    public readonly summaryStatus: string,
  ) {
    super(`Report "${reportId}" cannot be resummarized while summary is "${summaryStatus}"`);
    this.name = 'ReportNotResummarizableError';
  }
}
