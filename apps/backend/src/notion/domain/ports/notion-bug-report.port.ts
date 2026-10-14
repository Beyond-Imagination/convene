import { BugReportRequest } from '@convene/shared-interfaces';

export const NOTION_BUG_REPORT = Symbol('NOTION_BUG_REPORT');

export interface BugReport extends BugReportRequest {
  readonly reportedAt: Date;
}

export interface BugReportImage {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface NotionBugReportPort {
  createIssue(report: BugReport): Promise<void>;
  /** 노션 파일 업로드에 올리고 그 id 를 돌려준다. 이슈 본문 이미지 블록이 이 id 를 가리킨다. */
  uploadImage(image: BugReportImage): Promise<string>;
}
