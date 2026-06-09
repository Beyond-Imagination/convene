/**
 * MeetingReport Aggregate의 식별자 발급 포트.
 */
export interface ReportIdGenerator {
  next(): string;
}
