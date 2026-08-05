import { Inject, Injectable } from '@nestjs/common';

import { NOTION_ISSUE, NotionIssuePort } from '@/notion/domain/ports/notion-issue.port';
import {
  LOGGER,
  LoggerPort,
  MEETING_CREATION_PORT,
  MeetingCreationPort,
} from '@/shared-kernel/domain/ports';
import { externalReference } from '@/shared-kernel/domain/value-objects';

export const MEETING_LINK_BASE = Symbol('MEETING_LINK_BASE');

export interface ProvisionResult {
  readonly issueId: string;
  readonly code: string;
  readonly url: string;
}

interface ProvisionOptions {
  // true면 링크 기입 실패를 삼키고 회의 결과를 반환한다(즉시 경로). 폴링은 strict.
  readonly bestEffortLink?: boolean;
}

export interface PollOutcome {
  /** 필터에 걸린 이슈 수. found > provisioned면 일부가 실패했다는 뜻. */
  readonly found: number;
  readonly provisioned: number;
}

// 즉시 경로(컨트롤러)와 자동 경로(폴링)가 공유하는 회의 생성+링크 기입 use-case.
@Injectable()
export class NotionMeetingProvisioningService {
  constructor(
    @Inject(MEETING_CREATION_PORT) private readonly meetingCreation: MeetingCreationPort,
    @Inject(NOTION_ISSUE) private readonly notionIssue: NotionIssuePort,
    @Inject(MEETING_LINK_BASE) private readonly meetingLinkBase: string,
    @Inject(LOGGER) private readonly logger: LoggerPort,
  ) {}

  async provisionForIssue(
    issueId: string,
    title: string | null,
    options?: ProvisionOptions,
  ): Promise<ProvisionResult> {
    const meeting = await this.meetingCreation.create({
      source: 'notion-issue',
      meetingType: 'general',
      externalReference: externalReference({ issueId }),
      title,
      // 링크만 먼저 이슈에 걸어두고, 사람이 들어오는 순간 방이 열린다.
      // 즉시 열면 아무도 오기 전에 idle로 닫혀 링크가 죽는다.
      scheduled: true,
    });
    const url = `${this.meetingLinkBase}/meetings/${meeting.code}`;
    try {
      await this.notionIssue.writeMeetingLink(issueId, url);
    } catch (error) {
      // 폴링(strict)은 재던져 다음 주기에 재시도(멱등). 즉시 경로는 삼키고 회의로 보낸다.
      if (!options?.bestEffortLink) throw error;
      this.logger.error({ issueId, err: error }, 'notion 회의 링크 기입 실패(best-effort)');
    }
    try {
      await this.notionIssue.embedMeetingCard(issueId, url);
    } catch (error) {
      // 카드는 링크를 보기 좋게 보여주는 부가 표시라, 실패해도 회의 발급은 유효하다.
      this.logger.error({ issueId, err: error }, 'notion 회의 카드 삽입 실패(best-effort)');
    }
    return { issueId, code: meeting.code, url };
  }

  async pollPendingIssues(now: Date): Promise<PollOutcome> {
    const issues = await this.notionIssue.findPendingIssues(now);
    let provisioned = 0;
    for (const issue of issues) {
      try {
        await this.provisionForIssue(issue.issueId, issue.title);
        provisioned += 1;
      } catch (error) {
        // best-effort: 한 이슈 실패가 나머지 이슈 처리를 막지 않는다.
        this.logger.error({ issueId: issue.issueId, err: error }, 'notion 회의 생성 실패');
      }
    }
    return { found: issues.length, provisioned };
  }
}
