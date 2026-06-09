/**
 * MeetingReport Aggregate의 식별자 발급 포트.
 *
 * 운영 구현체는 MongoDB `ObjectId` 호환 문자열을, 테스트 구현체는 결정론적
 * 시퀀스를 돌려준다. `Date.now()`/`uuid()` 같은 사이드 이펙트를 포트 뒤로 격리한다.
 */
export interface ReportIdGenerator {
  next(): string;
}
