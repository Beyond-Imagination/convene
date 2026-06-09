/**
 * e2e 전용 jest 설정. src 단위 jest와 분리해 testRegex / rootDir을 따로 잡는다.
 * `pnpm test:e2e`가 이 설정을 직접 가리킨다.
 */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^ioredis$': 'ioredis-mock',
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  // e2e 전 mongodb-memory-server 인스턴스를 띄우고 MONGO_URI를 주입한다.
  // RedisModule은 lazyConnect로 본 setup 이 없어도 부트되지만, mongoose는 createConnection 시점에 즉시 connect를 시도해 실 mongo가 필요하다.
  globalSetup: '<rootDir>/test/jest-e2e.global-setup.cjs',
  globalTeardown: '<rootDir>/test/jest-e2e.global-teardown.cjs',
};
