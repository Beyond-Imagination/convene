export class ReportNotFoundError extends Error {
  constructor(public readonly reportId: string) {
    super(`Report "${reportId}" not found`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * 재요약 대상이 아닌 회의록에 재요약을 요청했을 때 발생한다.
 *
 * 재요약 가능 조건: STT 가 완료되어(sttStatus=done) transcript 가 있고, 1차 요약이
 * 이미 끝난(summaryStatus=done/failed, 진행 중 아님) 상태. 어긋나면 `reason` 에
 * 사유를 담아 던지며, Interface 가 409 Conflict 로 매핑한다.
 */
export class ReportNotResummarizableError extends Error {
  constructor(
    public readonly reportId: string,
    public readonly reason: string,
  ) {
    super(`Report "${reportId}" cannot be resummarized: ${reason}`);
    this.name = 'ReportNotResummarizableError';
  }
}
