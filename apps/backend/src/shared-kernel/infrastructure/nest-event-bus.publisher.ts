import type { DomainEventName } from '@migration/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

  /**
   * `emitter.emit` 은 listener 의 Promise 를 무시(fire-and-forget) 하므로
   * cross-BC lifecycle 처리(예: admitParticipant) 가 race 를 만든다.
   * `emitAsync` 는 모든 listener 의 Promise 를 Promise.all 로 묶어 await 가능.
   * 본 메서드를 await 하는 호출자는 listener 완료 후 다음 동작을 수행한다.
   */
  async publish(name: DomainEventName, payload: unknown): Promise<void> {
    await this.emitter.emitAsync(name, payload);
  }
}
