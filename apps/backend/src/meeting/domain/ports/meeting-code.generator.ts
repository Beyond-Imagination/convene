import { MeetingCode } from '../value-objects';

/**
 * 새 회의 코드 발급 추상화.
 *
 * 구현체는 8자 [a-z0-9]를 임의 생성한다. v1 트래픽 규모(~2.8 × 10^12 조합)에서
 * 충돌은 무시 가능한 수준으로 가정하며, 실제 유일성은 Repository가 보장한다.
 */
export interface MeetingCodeGenerator {
  next(): MeetingCode;
}
