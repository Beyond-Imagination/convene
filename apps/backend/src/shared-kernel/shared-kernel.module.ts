import { Global, Module } from '@nestjs/common';

import { EVENT_PUBLISHER } from '@/shared-kernel/domain/ports/event-publisher';
import { LOGGER } from '@/shared-kernel/domain/ports/logger';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

// 구현이 하나뿐이고 주입 상태도 없는 SystemClock은 포트 없이 클래스 자체를 토큰으로 쓴다.
const TOKEN_PROVIDERS = [
  { provide: EVENT_PUBLISHER, useClass: NestEventBusDomainEventPublisher },
  { provide: LOGGER, useClass: PinoLoggerAdapter },
];

/**
 * 여러 곳에서 재사용되는 production 어댑터를 묶어 export 하는 `@Global()` 모듈.
 * imports 없이 어디서나 inject 할 수 있다.
 */
@Global()
@Module({
  providers: [SystemClock, ...TOKEN_PROVIDERS],
  exports: [SystemClock, ...TOKEN_PROVIDERS.map(({ provide }) => provide)],
})
export class SharedKernelModule {}
