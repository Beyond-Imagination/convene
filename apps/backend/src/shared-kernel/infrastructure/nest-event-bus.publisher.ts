import type { DomainEventName } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DomainEventPublisher } from '@/shared-kernel/domain/ports/event-publisher';

/**
 * DomainEventPublisher 포트의 production 어댑터.
 *
 * `@nestjs/event-emitter`의 EventEmitter2에 위임한다.
 */
@Injectable()
export class NestEventBusDomainEventPublisher implements DomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(name: DomainEventName, payload: unknown): Promise<void> {
    /**
     * `emitter.emit`은 listener의 Promise를 무시하므로 cross-BC lifecycle 처리가 race를 만든다.
     * `emitAsync`는 모든 listener의 Promise를 Promise.all로 묶어 await 가능.
     */
    await this.emitter.emitAsync(name, payload);
  }
}
