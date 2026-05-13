import { notionPushResult } from './notion-push-result';

describe('NotionPushResult', () => {
  const at = new Date('2026-01-01T00:00:00Z');

  it('정상 입력으로 영수증을 생성한다', () => {
    const r = notionPushResult({ pageId: '  page-xyz  ', at });
    expect(r.pageId).toBe('page-xyz');
    expect(r.at).toBe(at);
  });

  it.each(['', '   '])('pageId가 trim 후 비어 있으면 거부한다: "%s"', (p) => {
    expect(() => notionPushResult({ pageId: p, at })).toThrow(/pageId/);
  });

  it('pageId가 200자를 넘으면 거부한다', () => {
    expect(() => notionPushResult({ pageId: 'a'.repeat(201), at })).toThrow(/pageId/);
  });
});
