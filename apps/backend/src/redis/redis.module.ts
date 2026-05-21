import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

import { resolveRedisKeyPrefix, resolveRedisUrl } from '@/config/redis.config';

/**
 * 전역 Redis 클라이언트(`ioredis`) 인스턴스를 묶어주는 모듈.
 *
 * `ioredis` 의 default export 인 `Redis` 클래스 자체를 DI 토큰으로 사용한다.
 * Bounded Context 별 RedisXRepository 들은 `@Inject(Redis)` 또는 useFactory
 * inject 로 같은 인스턴스를 공유한다.
 *
 * 테스트에서는 `Test.createTestingModule(...).overrideProvider(Redis).useValue(new IORedisMock())`
 * 로 손쉽게 교체할 수 있다. 단위 spec 은 RedisXRepository 를 직접 인스턴스화하는
 * 패턴이라 본 모듈을 거치지 않는다.
 *
 * `onApplicationShutdown` 에서 `quit()` 으로 graceful close — Nest 의
 * `enableShutdownHooks()` 가 main.ts 에서 활성화된다(이미 활성).
 */
@Global()
@Module({
  providers: [
    {
      provide: Redis,
      useFactory: () =>
        new Redis(resolveRedisUrl(), {
          keyPrefix: resolveRedisKeyPrefix(),
          // 부트 단계에 즉시 connect 를 시도하지 않는다. 실 redis 가 없는 e2e 환경
          // (RedisModule 을 override 하기 직전) 에서도 모듈이 부트되어야 하므로,
          // 첫 명령 호출 시점까지 연결을 미룬다.
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        }),
    },
  ],
  exports: [Redis],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(Redis) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => {
        // 이미 끊긴 연결이면 무시. shutdown 단계라 ENOENT/ECONNRESET 은 안전하게 삼킨다.
      });
    }
  }
}
