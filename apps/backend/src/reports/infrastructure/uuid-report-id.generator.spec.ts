import { UuidReportIdGenerator } from './uuid-report-id.generator';

describe('UuidReportIdGenerator', () => {
  it('next()는 RFC 4122 v4 형식의 문자열을 돌려준다', () => {
    const gen = new UuidReportIdGenerator();
    const id = gen.next();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('연속 호출 시 매번 다른 id를 돌려준다', () => {
    const gen = new UuidReportIdGenerator();
    const ids = new Set([gen.next(), gen.next(), gen.next()]);
    expect(ids.size).toBe(3);
  });
});
