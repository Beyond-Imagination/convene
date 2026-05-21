import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Connection, createConnection } from 'mongoose';

import { resolveMongoDbName, resolveMongoUri } from '@/config/mongo.config';

/**
 * 전역 mongoose Connection 인스턴스를 묶어주는 모듈.
 *
 * `mongoose.createConnection(uri, { dbName })` 으로 Atlas 클러스터에 접속하며,
 * 운영/개발은 같은 URI 를 공유하되 `dbName` 만 분리한다(PLAN.md §3).
 *
 * 본 모듈은 mongoose 의 `Connection` 클래스를 직접 DI 토큰으로 쓴다.
 * `ReportRepository` 등 인프라 어댑터들은 `@Inject(Connection)` 으로 같은
 * 인스턴스를 공유하면서 자기 컬렉션에 대응하는 Model 만 생성한다(domain layer 는
 * 여전히 framework-free, mongoose 가 들어오지 않는다).
 *
 * 테스트에서는 `Test.createTestingModule(...).overrideProvider(Connection)` 또는
 * e2e globalSetup 에서 mongodb-memory-server URI 를 env 로 주입해 같은 토큰을
 * 공유한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: Connection,
      useFactory: () =>
        createConnection(resolveMongoUri(), {
          dbName: resolveMongoDbName(),
          // 명시적으로 buffer 를 비활성화하지 않는다. 부트 단계에 실 mongo 가
          // 아직 도달 불가하더라도 첫 명령 호출 시점까지 자동 재연결로 견딘다.
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
