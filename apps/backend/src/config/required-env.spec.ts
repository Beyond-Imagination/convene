import { isProductionEnv, requireInProduction } from './required-env';

const DEV_DEFAULT = 'dev-default';

describe('isProductionEnv', () => {
  it('NODE_ENV가 production이면 true', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true);
  });

  it('그 외에는 false', () => {
    expect(isProductionEnv({})).toBe(false);
    expect(isProductionEnv({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionEnv({ NODE_ENV: 'test' })).toBe(false);
  });
});

describe('requireInProduction', () => {
  it('값이 있으면 trim 해서 그대로 돌려준다', () => {
    expect(requireInProduction({ X: '  value  ' }, 'X', DEV_DEFAULT)).toBe('value');
  });

  it('개발에서는 값이 없으면 디폴트로 폴백한다', () => {
    expect(requireInProduction({}, 'X', DEV_DEFAULT)).toBe(DEV_DEFAULT);
    expect(requireInProduction({ X: '   ' }, 'X', DEV_DEFAULT)).toBe(DEV_DEFAULT);
  });

  it('운영에서는 값이 없으면 throw 한다', () => {
    expect(() => requireInProduction({ NODE_ENV: 'production' }, 'X', DEV_DEFAULT)).toThrow();
  });

  it('운영에서 빈 문자열도 미설정으로 본다', () => {
    expect(() =>
      requireInProduction({ NODE_ENV: 'production', X: '  ' }, 'X', DEV_DEFAULT),
    ).toThrow();
  });

  it('운영이어도 값이 있으면 통과한다', () => {
    expect(requireInProduction({ NODE_ENV: 'production', X: 'real' }, 'X', DEV_DEFAULT)).toBe(
      'real',
    );
  });

  it('throw 하는 에러는 변수 이름을 담는다', () => {
    expect(() => requireInProduction({ NODE_ENV: 'production' }, 'MONGO_URI', DEV_DEFAULT)).toThrow(
      /MONGO_URI/,
    );
  });
});
