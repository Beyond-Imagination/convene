export const REPORT_ID_GENERATOR = Symbol('REPORT_ID_GENERATOR');

/**
 * MeetingReport Aggregate의 식별자 발급 포트.
 * production은 `randomUUID`를 바인딩하고, 스펙은 결정적 값을 주입한다.
 */
export interface ReportIdGenerator {
  next(): string;
}
