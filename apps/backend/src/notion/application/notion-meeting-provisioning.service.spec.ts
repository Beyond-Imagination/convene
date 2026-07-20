import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionIssuePort, PendingIssue } from '@/notion/domain/ports/notion-issue.port';
import { CreatedMeeting, CreateMeetingInput, MeetingCreationPort } from '@/shared-kernel/domain/ports';
import { LoggerPort } from '@/shared-kernel/domain/ports';

function silentLogger(): LoggerPort {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop } as unknown as LoggerPort;
}

function fakeMeetingCreation(code: string): {
  port: MeetingCreationPort;
  inputs: CreateMeetingInput[];
} {
  const inputs: CreateMeetingInput[] = [];
  const port: MeetingCreationPort = {
    create: async (input: CreateMeetingInput): Promise<CreatedMeeting> => {
      inputs.push(input);
      return { code, hostToken: 'host-tok', startedAt: new Date('2026-07-20T00:00:00.000Z') };
    },
  };
  return { port, inputs };
}

function fakeNotionIssue(pending: PendingIssue[]): {
  port: NotionIssuePort;
  writes: { issueId: string; url: string }[];
} {
  const writes: { issueId: string; url: string }[] = [];
  const port: NotionIssuePort = {
    findPendingIssues: async (): Promise<PendingIssue[]> => pending,
    writeMeetingLink: async (issueId: string, url: string): Promise<void> => {
      writes.push({ issueId, url });
    },
  };
  return { port, writes };
}

function throwingLinkWriter(): NotionIssuePort {
  return {
    findPendingIssues: async (): Promise<PendingIssue[]> => [],
    writeMeetingLink: async (): Promise<void> => {
      throw new Error('notion down');
    },
  };
}

describe('NotionMeetingProvisioningService.provisionForIssue', () => {
  it('notion-issue 회의를 general로 생성하고 링크를 조립·기입한다', async () => {
    const meetingCreation = fakeMeetingCreation('ABC123');
    const notionIssue = fakeNotionIssue([]);
    const service = new NotionMeetingProvisioningService({
      meetingCreation: meetingCreation.port,
      notionIssue: notionIssue.port,
      meetingLinkBase: 'https://convene.example.com',
      logger: silentLogger(),
    });

    const result = await service.provisionForIssue('issue-1', '스프린트 회고');

    expect(meetingCreation.inputs[0]).toEqual({
      source: 'notion-issue',
      meetingType: 'general',
      externalReference: { issueId: 'issue-1' },
      title: '스프린트 회고',
    });
    expect(notionIssue.writes[0]).toEqual({
      issueId: 'issue-1',
      url: 'https://convene.example.com/meetings/ABC123',
    });
    expect(result).toEqual({
      issueId: 'issue-1',
      code: 'ABC123',
      url: 'https://convene.example.com/meetings/ABC123',
    });
  });

  it('링크 기입이 실패하면 기본은 예외를 전파한다(폴링 멱등 유지)', async () => {
    const service = new NotionMeetingProvisioningService({
      meetingCreation: fakeMeetingCreation('ABC').port,
      notionIssue: throwingLinkWriter(),
      meetingLinkBase: 'https://x',
      logger: silentLogger(),
    });

    await expect(service.provisionForIssue('issue-1', null)).rejects.toThrow();
  });

  it('bestEffortLink면 링크 기입이 실패해도 회의 결과를 반환한다(즉시 경로)', async () => {
    const service = new NotionMeetingProvisioningService({
      meetingCreation: fakeMeetingCreation('ABC').port,
      notionIssue: throwingLinkWriter(),
      meetingLinkBase: 'https://x',
      logger: silentLogger(),
    });

    const result = await service.provisionForIssue('issue-1', null, { bestEffortLink: true });

    expect(result).toEqual({ issueId: 'issue-1', code: 'ABC', url: 'https://x/meetings/ABC' });
  });
});

describe('NotionMeetingProvisioningService.pollPendingIssues', () => {
  it('대상 이슈마다 회의를 생성하고 생성 건수를 돌려준다', async () => {
    const meetingCreation = fakeMeetingCreation('CODE');
    const notionIssue = fakeNotionIssue([
      { issueId: 'a', title: 'A' },
      { issueId: 'b', title: null },
    ]);
    const service = new NotionMeetingProvisioningService({
      meetingCreation: meetingCreation.port,
      notionIssue: notionIssue.port,
      meetingLinkBase: 'https://x',
      logger: silentLogger(),
    });

    const count = await service.pollPendingIssues(new Date());

    expect(count).toBe(2);
    expect(notionIssue.writes.map((w) => w.issueId)).toEqual(['a', 'b']);
  });

  it('한 이슈 생성이 실패해도 나머지는 계속 처리한다(best-effort)', async () => {
    const notionIssue = fakeNotionIssue([
      { issueId: 'boom', title: null },
      { issueId: 'ok', title: null },
    ]);
    let attempt = 0;
    const meetingCreation: MeetingCreationPort = {
      create: async (): Promise<CreatedMeeting> => {
        attempt += 1;
        if (attempt === 1) throw new Error('notion down');
        return { code: 'OK', hostToken: 'h', startedAt: new Date() };
      },
    };
    const service = new NotionMeetingProvisioningService({
      meetingCreation,
      notionIssue: notionIssue.port,
      meetingLinkBase: 'https://x',
      logger: silentLogger(),
    });

    const count = await service.pollPendingIssues(new Date());

    expect(count).toBe(1);
    expect(notionIssue.writes.map((w) => w.issueId)).toEqual(['ok']);
  });
});
