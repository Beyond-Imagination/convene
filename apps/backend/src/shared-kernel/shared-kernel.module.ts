import { Global, Module } from '@nestjs/common';

import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * 여러 곳에서 재사용되는 production 어댑터(Clock, DomainEventPublisher)를 묶어
 * export 하는 `@Global()` 모듈. imports 없이 어디서나 inject 할 수 있다.
 */
@Global()
@Module({
  providers: [SystemClock, NestEventBusDomainEventPublisher],
  exports: [SystemClock, NestEventBusDomainEventPublisher],
})
export class SharedKernelModule {}
