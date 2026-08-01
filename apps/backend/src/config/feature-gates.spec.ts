import { resolveFeatureGates } from './feature-gates';

describe('resolveFeatureGates', () => {
  it('아무 env도 없으면 전부 off', () => {
    expect(resolveFeatureGates({})).toEqual({
      notionReportPush: false,
      notionPolling: false,
      notionButton: false,
      summarizer: false,
      adminApi: false,
    });
  });

  it('NOTION_TOKEN만 있으면 회의록 push만 켜진다', () => {
    const gates = resolveFeatureGates({ NOTION_TOKEN: 'ntn_x' });

    expect(gates.notionReportPush).toBe(true);
    expect(gates.notionPolling).toBe(false);
    expect(gates.notionButton).toBe(false);
  });

  it('NOTION_DB_IDS가 있어야 폴링이 켜진다', () => {
    const gates = resolveFeatureGates({ NOTION_TOKEN: 'ntn_x', NOTION_DB_IDS: 'db1,db2' });

    expect(gates.notionPolling).toBe(true);
  });

  it('NOTION_SIGNING_SECRET이 있어야 버튼 경로가 켜진다', () => {
    const gates = resolveFeatureGates({ NOTION_TOKEN: 'ntn_x', NOTION_SIGNING_SECRET: 's' });

    expect(gates.notionButton).toBe(true);
  });

  it('토큰이 없으면 DB_IDS·서명키가 있어도 노션은 전부 off', () => {
    const gates = resolveFeatureGates({ NOTION_DB_IDS: 'db1', NOTION_SIGNING_SECRET: 's' });

    expect(gates.notionPolling).toBe(false);
    expect(gates.notionButton).toBe(false);
  });

  it('GEMINI_API_KEY·ADMIN_API_TOKEN 유무가 요약·관리자 API를 가른다', () => {
    expect(resolveFeatureGates({ GEMINI_API_KEY: 'k' }).summarizer).toBe(true);
    expect(resolveFeatureGates({ ADMIN_API_TOKEN: 't' }).adminApi).toBe(true);
  });
});
