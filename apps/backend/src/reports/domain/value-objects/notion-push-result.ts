/**
 * notion BC가 회의록을 노션 페이지에 push한 결과 영수증.
 *
 * UI의 "노션 동기화됨" 표식이 이 값의 유무다.
 */
export interface NotionPushResult {
  readonly pageId: string;
  readonly at: Date;
}

const PAGE_ID_MAX = 200;

export function notionPushResult(input: { pageId: string; at: Date }): NotionPushResult {
  const pageId = input.pageId.trim();
  if (pageId.length === 0 || pageId.length > PAGE_ID_MAX) {
    throw new Error(`NotionPushResult.pageId must be 1~${PAGE_ID_MAX} chars after trim`);
  }
  return { pageId, at: input.at };
}
