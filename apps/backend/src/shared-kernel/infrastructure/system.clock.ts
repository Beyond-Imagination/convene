import { Injectable } from '@nestjs/common';

/**
 * 현재 시각 공급자. 스펙이 `{ now: () => 고정시각 }`을 그대로 넘길 수 있도록 상태를 두지 않는다
 * (private 필드가 생기면 구조적 타이핑이 깨져 별도 포트 인터페이스가 필요해진다).
 */
@Injectable()
export class SystemClock {
  now(): Date {
    return new Date();
  }
}
