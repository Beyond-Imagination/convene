import { Global, Module } from '@nestjs/common';

import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

const PROVIDERS = [SystemClock, NestEventBusDomainEventPublisher, PinoLoggerAdapter];

/**
 * 여러 곳에서 재사용되는 인프라를 묶어 export 하는 `@Global()` 모듈.
 * imports 없이 어디서나 inject 할 수 있다.
 *
 * 셋 다 교체 대상이 아니라(시계·pino·Nest 이벤트 버스) Port 없이 클래스 자체를 토큰으로 쓴다.
 */
@Global()
@Module({
  providers: PROVIDERS,
  exports: PROVIDERS,
})
export class SharedKernelModule {}
