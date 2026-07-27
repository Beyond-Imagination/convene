/**
 * notion BC가 회의록을 노션 페이지에 push한 결과 영수증.
 *
 * 현재는 항상 `null`로 두고 도큐먼트에 자리만 남긴다. push는 notion BC가 `report.finalized`를
 * 구독해 수행하고 멱등은 노션 앵커 조회로 보장하므로 reports는 결과를 되받지 않는다.
 * "노션에 올림" 표식이 UI에 필요해지면 notion BC가 완료 이벤트를 발행하고
 * Aggregate가 `attachNotionPushResult`로 1회만 보존한다.
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
