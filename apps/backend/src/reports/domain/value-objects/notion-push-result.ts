/**
 * v2 노션 어댑터가 회의록을 노션 페이지에 push한 결과 영수증.
 *
 * v1.0.0에서는 항상 `null`로 두고 도큐먼트에 자리만 남긴다.
 * v2에서 `NotionPort.push(report)`가 성공하면 본 VO가 채워지며,
 * Aggregate는 이를 `attachNotionPushResult`로 받아 1회만 보존한다.
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
