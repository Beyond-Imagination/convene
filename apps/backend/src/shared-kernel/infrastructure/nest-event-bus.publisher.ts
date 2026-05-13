import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DomainEventName } from '@migration/shared-interfaces';

import type { DomainEventPublisher } from '@/shared-kernel/domain/ports';

/**
 * DomainEventPublisher 포트의 production 어댑터.
 * 빌드 단계에서는 컴파일만 통과하면 충분하다 (TDD red 단계).
 */
@Injectable()
export class NestEventBusDomainEventPublisher implements DomainEventPublisher {
  constructor(private readonly _emitter: EventEmitter2) {
    void this._emitter; // silence unused-warning until impl
  }

  publish(_name: DomainEventName, _payload: unknown): void {
    throw new Error('not implemented');
  }
}
