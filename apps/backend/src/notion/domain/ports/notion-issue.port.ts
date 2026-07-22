export interface PendingIssue {
  readonly issueId: string;
  readonly title: string | null;
}

export interface NotionIssuePort {
  findPendingIssues(now: Date): Promise<PendingIssue[]>;
  writeMeetingLink(issueId: string, url: string): Promise<void>;
}
