/**
 * Jest e2e globalSetup. 모든 e2e worker 가 시작되기 전 main process 에서 1회 실행.
 *
 * Atlas 클러스터를 e2e 에서 쓰지 않기 위해, 본 setup 에서 mongodb-memory-server
 * 인스턴스를 띄우고 `MONGO_URI` 를 process.env 에 주입한다. child worker 는 부모
 * env 를 상속하므로 AppModule 의 MongoModule 이 이 URI 로 connect 한다.
 *
 * 서버 인스턴스는 globalTeardown 이 stop 할 수 있도록 globalThis 에 보관한다.
 */
module.exports = async () => {
  // .cjs CommonJS 파일이라 require 가 정당하다(no-require-imports 는 TS/ESM 대상 규칙).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.MONGO_DB_NAME = 'test-e2e';
  globalThis.__MONGOD__ = mongod;
};
