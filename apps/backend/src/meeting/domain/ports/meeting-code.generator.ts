import { MeetingCode } from '@/meeting/domain/value-objects';

/**
 * 새 회의 코드 발급 추상화.
 */
export interface MeetingCodeGenerator {
  next(): MeetingCode;
}
