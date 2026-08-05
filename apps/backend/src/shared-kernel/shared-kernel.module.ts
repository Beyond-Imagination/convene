import { Global, Module } from '@nestjs/common';

import { CLOCK, EVENT_PUBLISHER, LOGGER } from '@/shared-kernel/domain/ports';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

const PROVIDERS = [
  { provide: CLOCK, useClass: SystemClock },
  { provide: EVENT_PUBLISHER, useClass: NestEventBusDomainEventPublisher },
  { provide: LOGGER, useClass: PinoLoggerAdapter },
];

/**
 * 여러 곳에서 재사용되는 production 어댑터를 묶어 export 하는 `@Global()` 모듈.
 * imports 없이 어디서나 inject 할 수 있다.
 */
@Global()
@Module({
  providers: PROVIDERS,
  exports: PROVIDERS.map(({ provide }) => provide),
})
export class SharedKernelModule {}
