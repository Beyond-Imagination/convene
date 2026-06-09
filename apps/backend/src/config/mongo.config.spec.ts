import {
  DEFAULT_MONGO_DB_NAME,
  DEFAULT_MONGO_URI,
  resolveMongoDbName,
  resolveMongoUri,
} from './mongo.config';

describe('resolveMongoUri', () => {
  it('MONGO_URI가 없으면 DEFAULT_MONGO_URI를 돌려준다', () => {
    expect(resolveMongoUri({})).toBe(DEFAULT_MONGO_URI);
  });

  it('MONGO_URI가 빈 문자열이면 디폴트로 fallback', () => {
    expect(resolveMongoUri({ MONGO_URI: '' })).toBe(DEFAULT_MONGO_URI);
    expect(resolveMongoUri({ MONGO_URI: '   ' })).toBe(DEFAULT_MONGO_URI);
  });

  it('mongodb:// 스킴 URI를 그대로 돌려준다', () => {
    expect(resolveMongoUri({ MONGO_URI: 'mongodb://localhost:27017' })).toBe(
      'mongodb://localhost:27017',
    );
  });

  it('mongodb+srv:// 스킴(Atlas) URI도 허용한다', () => {
    expect(
      resolveMongoUri({ MONGO_URI: 'mongodb+srv://user:pw@cluster.example/?retryWrites=true' }),
    ).toBe('mongodb+srv://user:pw@cluster.example/?retryWrites=true');
  });

  it('mongodb:// / mongodb+srv:// 스킴이 아니면 throw', () => {
    expect(() => resolveMongoUri({ MONGO_URI: 'http://localhost:27017' })).toThrow(/MONGO_URI/);
    expect(() => resolveMongoUri({ MONGO_URI: 'localhost:27017' })).toThrow(/MONGO_URI/);
  });
});

describe('resolveMongoDbName', () => {
  it('MONGO_DB_NAME이 없으면 DEFAULT_MONGO_DB_NAME를 돌려준다', () => {
    expect(resolveMongoDbName({})).toBe(DEFAULT_MONGO_DB_NAME);
  });

  it('MONGO_DB_NAME이 빈 문자열이면 디폴트로 fallback', () => {
    expect(resolveMongoDbName({ MONGO_DB_NAME: '' })).toBe(DEFAULT_MONGO_DB_NAME);
    expect(resolveMongoDbName({ MONGO_DB_NAME: '   ' })).toBe(DEFAULT_MONGO_DB_NAME);
  });

  it('명시된 db name을 trim 해서 돌려준다(개발/운영 분리용)', () => {
    expect(resolveMongoDbName({ MONGO_DB_NAME: '  convene-dev  ' })).toBe('convene-dev');
    expect(resolveMongoDbName({ MONGO_DB_NAME: 'convene-prod' })).toBe('convene-prod');
  });
});
