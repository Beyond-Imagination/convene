import { MeetingCode } from '@/meeting/domain/value-objects';

export const MEETING_CODE_GENERATOR = Symbol('MEETING_CODE_GENERATOR');

/**
 * 새 회의 코드 발급 추상화.
 */
export interface MeetingCodeGenerator {
  next(): MeetingCode;
}
