import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Connection, createConnection } from 'mongoose';

import { resolveMongoDbName, resolveMongoUri } from '@/config/mongo.config';

/**
 * 전역 mongoose Connection 인스턴스를 묶어주는 모듈.
 *
 * 환경별로 같은 클러스터 URI를 공유하되 `dbName`만 분리한다.
 * mongoose의 `Connection` 클래스 자체를 DI 토큰으로 쓴다.
 */
@Global()
@Module({
  providers: [
    {
      provide: Connection,
      useFactory: () =>
        createConnection(resolveMongoUri(), {
          dbName: resolveMongoDbName(),
          // 명시적으로 buffer를 비활성화하지 않는다. 부트 단계에 실 mongo가 아직 도달 불가하더라도 첫 명령 호출 시점까지 자동 재연결로 견딘다.
          serverSelectionTimeoutMS: 5000,
        }),
    },
  ],
  exports: [Connection],
})
export class MongoModule implements OnApplicationShutdown {
  constructor(@Inject(Connection) private readonly connection: Connection) {}

  async onApplicationShutdown(): Promise<void> {
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting.
    if (this.connection.readyState !== 0) {
      await this.connection.close().catch(() => {
        // shutdown 단계라 cleanup 실패는 안전하게 삼킨다.
      });
    }
  }
}
