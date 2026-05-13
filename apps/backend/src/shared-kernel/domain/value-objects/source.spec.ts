import { asSource, SOURCES } from './source';

describe('Source', () => {
  it('v1과 v2의 source 두 개만 포함한다', () => {
    expect(SOURCES).toEqual(['web', 'notion-issue']);
  });

  it.each(SOURCES)('asSource는 알려진 값을 허용한다: "%s"', (s) => {
    expect(asSource(s)).toBe(s);
  });

  it.each(['', 'WEB', 'slack', 'notion', 'notion_issue'])(
    'asSource는 알려지지 않은 값을 거부한다: "%s"',
    (raw) => {
      expect(() => asSource(raw)).toThrow(/Source/);
    },
  );
});
