import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { HostTokenGenerator } from '@/meeting/domain/ports';

/**
 * HostTokenGenerator 의 production 구현체.
 *
 * `crypto.randomUUID()` 로 추측 불가능한 토큰을 발급한다. 회의 생성 응답으로만
 * 노출되며 저장소에는 Meeting snapshot 의 일부로 영속된다.
 */
@Injectable()
export class RandomHostTokenGenerator implements HostTokenGenerator {
  next(): string {
    return randomUUID();
  }
}
