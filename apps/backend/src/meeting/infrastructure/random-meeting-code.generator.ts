import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { MeetingCodeGenerator } from '@/meeting/domain/ports';
import { MeetingCode } from '@/meeting/domain/value-objects';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * MeetingCodeGenerator의 production 구현체.
 *
 * `crypto.randomInt`로 ALPHABET에서 8자리를 균등 추출한다.
 * 36^8 ≈ 2.8 × 10^12 조합이라 현재 환경에서 충돌은 무시 가능하며, 실제 유일성은 MeetingRepository가 보장한다.
 */
@Injectable()
export class RandomMeetingCodeGenerator implements MeetingCodeGenerator {
  next(): MeetingCode {
    let raw = '';
    for (let i = 0; i < MeetingCode.LENGTH; i++) {
      raw += ALPHABET[randomInt(ALPHABET.length)];
    }
    return MeetingCode.from(raw);
  }
}
