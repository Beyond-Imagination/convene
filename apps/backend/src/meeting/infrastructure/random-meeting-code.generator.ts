import { MeetingCode } from '@/meeting/domain/value-objects';
import { MeetingCodeGenerator } from '@/meeting/domain/ports';

/**
 * MeetingCodeGenerator 포트의 production 구현체.
 * 빌드 단계에서는 컴파일만 통과하면 충분하다 (TDD red 단계).
 */
export class RandomMeetingCodeGenerator implements MeetingCodeGenerator {
  next(): MeetingCode {
    throw new Error('not implemented');
  }
}
