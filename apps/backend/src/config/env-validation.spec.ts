import { assertEnvIsValid } from './env-validation';

/** 운영 부팅에 필요한 최소 env. 검증이 통과해야 하는 기준선. */
const productionEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb+srv://user:pw@cluster.example.com',
  MONGO_DB_NAME: 'convene-prod',
  REDIS_URL: 'redis://redis:6379',
  CORS_ORIGIN: 'https://convene.example.com',
  ANNOUNCED_IP: '203.0.113.10',
});

describe('assertEnvIsValid', () => {
  it('개발 환경은 아무 env 없이도 통과한다', () => {
    expect(() => assertEnvIsValid({})).not.toThrow();
  });

  it('운영 필수값이 모두 있으면 통과한다', () => {
    expect(() => assertEnvIsValid(productionEnv())).not.toThrow();
  });

  it.each(['MONGO_URI', 'MONGO_DB_NAME', 'REDIS_URL', 'CORS_ORIGIN', 'ANNOUNCED_IP'])(
    '운영에서 %s가 없으면 throw 한다',
    (name) => {
      const env = productionEnv();
      delete env[name];
      expect(() => assertEnvIsValid(env)).toThrow(new RegExp(name));
    },
  );

  it('누락이 여럿이면 한 번에 모두 보고한다', () => {
    const env = productionEnv();
    delete env.MONGO_URI;
    delete env.ANNOUNCED_IP;

    expect(() => assertEnvIsValid(env)).toThrow(/MONGO_URI/);
    expect(() => assertEnvIsValid(env)).toThrow(/ANNOUNCED_IP/);
  });

  it('형식이 잘못된 값도 잡아낸다', () => {
    expect(() => assertEnvIsValid({ ...productionEnv(), REDIS_URL: 'http://redis:6379' })).toThrow(
      /REDIS_URL/,
    );
    expect(() => assertEnvIsValid({ ...productionEnv(), PORT: '99999' })).toThrow(/PORT/);
  });

  it('기능 게이트(노션·Gemini·admin)는 없어도 부팅을 막지 않는다', () => {
    const env = productionEnv();
    delete env.NOTION_TOKEN;
    delete env.GEMINI_API_KEY;
    delete env.ADMIN_API_TOKEN;

    expect(() => assertEnvIsValid(env)).not.toThrow();
  });

  it('기능 게이트가 켜져 있는데 값 형식이 틀리면 잡아낸다', () => {
    expect(() =>
      assertEnvIsValid({
        ...productionEnv(),
        NOTION_TOKEN: 'ntn_x',
        NOTION_TIMEOUT_MS: 'not-a-number',
      }),
    ).toThrow(/NOTION_TIMEOUT_MS/);
  });
});
