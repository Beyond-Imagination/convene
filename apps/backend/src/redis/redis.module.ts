import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import {
  REDIS_MAX_RETRIES_PER_REQUEST,
  redisRetryStrategy,
  resolveRedisKeyPrefix,
  resolveRedisUrl,
} from '@/config/redis.config';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

/**
 * 연결 상태 전이를 구조화 로그로 남긴다.
 * 리스너가 하나도 없으면 ioredis 가 연결 오류를 `console.error`로 흘려 pino 를 우회한다.
 */
function attachConnectionLogging(client: Redis, logger: PinoLoggerAdapter): void {
  client.on('error', (err: Error) => logger.error({ err }, 'redis 연결 오류'));
  client.on('reconnecting', (delayMs: number) => logger.warn({ delayMs }, 'redis 재연결 시도'));
  client.on('ready', () => logger.info({}, 'redis 연결 준비 완료'));
}

/**
 * 전역 Redis 클라이언트(`ioredis`) 인스턴스를 묶어주는 모듈.
 *
 * `ioredis`의 default export인 `Redis` 클래스 자체를 DI 토큰으로 사용한다.
 * 각 RedisXRepository는 `@Inject(Redis)` 또는 useFactory inject로 같은 인스턴스를 공유한다.
 *
 * `onApplicationShutdown`에서 `quit()`으로 graceful close — Nest의 `enableShutdownHooks()`가 main.ts에서 활성화된다(이미 활성).
 */
@Global()
@Module({
  providers: [
    {
      provide: Redis,
      useFactory: (pino: PinoLogger) => {
        const client = new Redis(resolveRedisUrl(), {
          keyPrefix: resolveRedisKeyPrefix(),
          // 부트 단계에 즉시 connect를 시도하지 않는다.
          // 실 redis가 없는 e2e 환경에서도 모듈이 부트되어야 하므로, 첫 명령 호출 시점까지 연결을 미룬다.
          lazyConnect: true,
          // redis 재기동(수 초) 동안 명령을 실패시키지 않고 버틴다.
          // 기본 backoff(50ms 배수)에 재시도 3회면 0.3초 만에 포기해 컨테이너 재기동을 못 넘긴다.
          retryStrategy: redisRetryStrategy,
          maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
        });
        attachConnectionLogging(client, new PinoLoggerAdapter(pino, RedisModule.name));
        return client;
      },
      inject: [PinoLogger],
    },
  ],
  exports: [Redis],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(Redis) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => {
        // 이미 끊긴 연결이면 무시. shutdown 단계라 ENOENT/ECONNRESET은 안전하게 삼킨다.
      });
    }
  }
}
