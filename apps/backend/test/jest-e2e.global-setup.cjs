/**
 * Jest e2e globalSetup. 모든 e2e worker가 시작되기 전 main process에서 1회 실행.
 *
 * Atlas 클러스터를 e2e에서 쓰지 않기 위해, 본 setup에서 mongodb-memory-server 인스턴스를 띄우고 `MONGO_URI`를 process.env 에 주입한다.
 * child worker는 부모 env를 상속하므로 AppModule의 MongoModule이 이 URI로 connect한다.
 *
 * 서버 인스턴스는 globalTeardown이 stop할 수 있도록 globalThis에 보관한다.
 */
module.exports = async () => {
  // 개발자 .env의 키가 ConfigModule로 로드되면 e2e가 실제 LLM을 호출하고 과금된다.
  // provider override에만 기대지 않도록(토큰명이 바뀌면 조용히 뚫린다) 키 자체를 제거해
  // SummarizerPort가 항상 NoopSummarizer로 fallback 하게 만든다.
  delete process.env.GEMINI_API_KEY;

  // .cjs CommonJS 파일이라 require가 정당하다(no-require-imports는 TS/ESM 대상 규칙).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.MONGO_DB_NAME = 'test-e2e';
  globalThis.__MONGOD__ = mongod;
};
