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
  },
  testEnvironment: 'node',
  testTimeout: 15000,
};
