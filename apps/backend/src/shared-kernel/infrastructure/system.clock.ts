import { Injectable } from '@nestjs/common';

import { Clock } from '@/shared-kernel/domain/ports';

/**
 * Clock의 production 구현체. 시스템 시계를 그대로 노출한다.
 */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
