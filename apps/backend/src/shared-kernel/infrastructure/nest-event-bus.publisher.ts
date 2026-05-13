import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DomainEventName } from '@migration/shared-interfaces';

import type { DomainEventPublisher } from '@/shared-kernel/domain/ports';

/**
 * DomainEventPublisher 포트의 production 어댑터.
 *
 * `@nestjs/event-emitter`의 EventEmitter2에 위임한다. AppModule의
 * `EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })` 설정과
 * 짝지어 `meeting.**`, `report.**` 같은 와일드카드 구독을 지원한다.
 */
@Injectable()
export class NestEventBusDomainEventPublisher implements DomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(name: DomainEventName, payload: unknown): void {
    this.emitter.emit(name, payload);
  }
}
