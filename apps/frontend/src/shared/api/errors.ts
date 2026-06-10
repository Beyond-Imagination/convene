/**
 * API(HTTP) 호출 실패의 최상위 에러.
 *
 * 기능별 client(meeting/reports)는 본 클래스를 확장해 호출부에서
 * `instanceof ApiError`로 일괄 식별하거나 구체 타입으로 분기할 수 있다.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    // 프로덕션 minify가 클래스명을 mangle 하므로 new.target.name 대신 하드코딩.
    this.name = 'ApiError';
  }
}
