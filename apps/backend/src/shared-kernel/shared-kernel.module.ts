import { Global, Module } from '@nestjs/common';

import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Shared Kernel의 NestJS 모듈.
 *
 * Bounded Context를 가로질러 재사용되는 production 어댑터(Clock,
 * DomainEventPublisher)를 한 곳에서 묶고 export한다. `@Global()`로 두어
 * 매 모듈마다 imports에 적지 않고도 inject할 수 있게 한다.
 *
 * 도메인 layer의 Shared Kernel(VO들)은 별도 디렉토리(`shared-kernel/domain/`)에서
 * import-only로 쓰이며, 본 모듈은 infrastructure 어댑터의 DI 묶음 역할만 한다.
 */
@Global()
@Module({
  providers: [SystemClock, NestEventBusDomainEventPublisher],
  exports: [SystemClock, NestEventBusDomainEventPublisher],
})
export class SharedKernelModule {}
