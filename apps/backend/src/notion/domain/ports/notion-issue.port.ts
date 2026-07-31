export interface PendingIssue {
  readonly issueId: string;
  readonly title: string | null;
}

export interface NotionIssuePort {
  findPendingIssues(now: Date): Promise<PendingIssue[]>;
  writeMeetingLink(issueId: string, url: string): Promise<void>;
  /** 이슈 페이지 맨 위에 회의 카드를 심는다. 이슈당 하나만 남도록 이전 카드는 교체한다. */
  embedMeetingCard(issueId: string, url: string): Promise<void>;
}
