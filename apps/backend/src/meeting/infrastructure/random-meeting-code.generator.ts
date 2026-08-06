import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 회의 코드 발급기.
 *
 * `crypto.randomInt`로 ALPHABET에서 8자리를 균등 추출한다.
 * 36^8 ≈ 2.8 × 10^12 조합이라 현재 환경에서 충돌은 무시 가능하며, 실제 유일성은 MeetingRepository가 보장한다.
 */
@Injectable()
export class RandomMeetingCodeGenerator {
  next(): MeetingCode {
    let raw = '';
    for (let i = 0; i < MeetingCode.LENGTH; i++) {
      raw += ALPHABET[randomInt(ALPHABET.length)];
    }
    return MeetingCode.from(raw);
  }
}
