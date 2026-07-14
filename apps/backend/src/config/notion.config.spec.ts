import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_TIMEOUT_MS,
  DEFAULT_NOTION_VERSION,
  resolveNotionConfig,
} from './notion.config';

describe('resolveNotionConfig', () => {
  it('NOTION_TOKEN이 없으면 null을 돌려준다(노션 기능 dormant 신호)', () => {
    expect(resolveNotionConfig({})).toBeNull();
    expect(resolveNotionConfig({ NOTION_TOKEN: '' })).toBeNull();
    expect(resolveNotionConfig({ NOTION_TOKEN: '   ' })).toBeNull();
  });

  it('NOTION_TOKEN만 있으면 version/baseUrl/timeout은 디폴트, databaseIds는 빈 배열', () => {
    expect(resolveNotionConfig({ NOTION_TOKEN: 't' })).toEqual({
      token: 't',
      version: DEFAULT_NOTION_VERSION,
      baseUrl: DEFAULT_NOTION_BASE_URL,
      timeoutMs: DEFAULT_NOTION_TIMEOUT_MS,
      databaseIds: [],
    });
  });

  it('NOTION_VERSION / NOTION_BASE_URL / NOTION_TIMEOUT_MS를 적용한다', () => {
    expect(
      resolveNotionConfig({
        NOTION_TOKEN: 't',
        NOTION_VERSION: '2022-06-28',
        NOTION_BASE_URL: 'https://api.notion.com/',
        NOTION_TIMEOUT_MS: '15000',
      }),
    ).toMatchObject({
      token: 't',
      version: '2022-06-28',
      baseUrl: 'https://api.notion.com',
      timeoutMs: 15000,
    });
  });

  it('NOTION_DB_IDS는 콤마 구분 복수 DB(팀/프로젝트 이슈 관리)를 파싱한다', () => {
    expect(resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_DB_IDS: 'team-db' })?.databaseIds).toEqual(
      ['team-db'],
    );
    expect(
      resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_DB_IDS: 'team-db, project-db , extra-db' })
        ?.databaseIds,
    ).toEqual(['team-db', 'project-db', 'extra-db']);
  });

  it('NOTION_DB_IDS의 빈 항목/공백은 제거한다', () => {
    expect(
      resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_DB_IDS: 'team-db,,  ,project-db,' })
        ?.databaseIds,
    ).toEqual(['team-db', 'project-db']);
  });

  it('NOTION_TIMEOUT_MS가 양의 정수가 아니면 throw', () => {
    expect(() => resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_TIMEOUT_MS: '0' })).toThrow(
      /NOTION_TIMEOUT_MS/,
    );
    expect(() => resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_TIMEOUT_MS: '-5' })).toThrow(
      /NOTION_TIMEOUT_MS/,
    );
    expect(() => resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_TIMEOUT_MS: 'abc' })).toThrow(
      /NOTION_TIMEOUT_MS/,
    );
    expect(() => resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_TIMEOUT_MS: '1.5' })).toThrow(
      /NOTION_TIMEOUT_MS/,
    );
  });

  it('NOTION_BASE_URL이 http(s) 스킴이 아니면 throw', () => {
    expect(() =>
      resolveNotionConfig({ NOTION_TOKEN: 't', NOTION_BASE_URL: 'ftp://x' }),
    ).toThrow(/NOTION_BASE_URL/);
  });
});
