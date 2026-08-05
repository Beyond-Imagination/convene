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
  cards: { issueId: string; url: string }[];
} {
  const writes: { issueId: string; url: string }[] = [];
  const cards: { issueId: string; url: string }[] = [];
  const port: NotionIssuePort = {
    findPendingIssues: async (): Promise<PendingIssue[]> => pending,
    writeMeetingLink: async (issueId: string, url: string): Promise<void> => {
      writes.push({ issueId, url });
    },
    embedMeetingCard: async (issueId: string, url: string): Promise<void> => {
      cards.push({ issueId, url });
    },
  };
  return { port, writes, cards };
}

function throwingLinkWriter(): NotionIssuePort {
  return {
    findPendingIssues: async (): Promise<PendingIssue[]> => [],
    writeMeetingLink: async (): Promise<void> => {
      throw new Error('notion down');
    },
    embedMeetingCard: async (): Promise<void> => undefined,
  };
}

describe('NotionMeetingProvisioningService 회의 카드', () => {
  const makeService = (notionIssue: NotionIssuePort) =>
    new NotionMeetingProvisioningService(
      fakeMeetingCreation('ABC123').port,
      notionIssue,
      'https://convene.example.com',
      silentLogger(),
    );

  it('이슈 페이지에 회의 링크와 같은 주소로 카드를 심는다', async () => {
    const notionIssue = fakeNotionIssue([]);
    await makeService(notionIssue.port).provisionForIssue('issue-1', '스프린트 회고');

    expect(notionIssue.cards).toEqual([
      { issueId: 'issue-1', url: 'https://convene.example.com/meetings/ABC123' },
    ]);
  });

  it('카드 삽입이 실패해도 회의 발급은 성공으로 돌려준다(부가 표시)', async () => {
    const notionIssue = fakeNotionIssue([]);
    const failing: NotionIssuePort = {
      ...notionIssue.port,
      embedMeetingCard: async (): Promise<void> => {
        throw new Error('notion down');
      },
    };

    await expect(makeService(failing).provisionForIssue('issue-1', null)).resolves.toMatchObject({
      code: 'ABC123',
    });
  });
});

describe('NotionMeetingProvisioningService.provisionForIssue', () => {
  it('notion-issue 회의를 예약 발급하고 링크를 조립·기입한다', async () => {
    const meetingCreation = fakeMeetingCreation('ABC123');
    const notionIssue = fakeNotionIssue([]);
    const service = new NotionMeetingProvisioningService(
      meetingCreation.port,
      notionIssue.port,
      'https://convene.example.com',
      silentLogger(),
    );

    const result = await service.provisionForIssue('issue-1', '스프린트 회고');

    expect(meetingCreation.inputs[0]).toEqual({
      source: 'notion-issue',
      meetingType: 'general',
      externalReference: { issueId: 'issue-1' },
      title: '스프린트 회고',
      // 사람이 들어오기 전에 방이 idle로 죽지 않도록 예약 발급한다.
      scheduled: true,
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
    const service = new NotionMeetingProvisioningService(
      fakeMeetingCreation('ABC').port,
      throwingLinkWriter(),
      'https://x',
      silentLogger(),
    );

    await expect(service.provisionForIssue('issue-1', null)).rejects.toThrow();
  });

  it('bestEffortLink면 링크 기입이 실패해도 회의 결과를 반환한다(즉시 경로)', async () => {
    const service = new NotionMeetingProvisioningService(
      fakeMeetingCreation('ABC').port,
      throwingLinkWriter(),
      'https://x',
      silentLogger(),
    );

    const result = await service.provisionForIssue('issue-1', null, { bestEffortLink: true });

    expect(result).toEqual({ issueId: 'issue-1', code: 'ABC', url: 'https://x/meetings/ABC' });
  });
});

describe('NotionMeetingProvisioningService.pollPendingIssues', () => {
  it('대상 이슈마다 회의를 생성하고 조회·생성 건수를 돌려준다', async () => {
    const meetingCreation = fakeMeetingCreation('CODE');
    const notionIssue = fakeNotionIssue([
      { issueId: 'a', title: 'A' },
      { issueId: 'b', title: null },
    ]);
    const service = new NotionMeetingProvisioningService(
      meetingCreation.port,
      notionIssue.port,
      'https://x',
      silentLogger(),
    );

    const outcome = await service.pollPendingIssues(new Date());

    expect(outcome).toEqual({ found: 2, provisioned: 2 });
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
    const service = new NotionMeetingProvisioningService(
      meetingCreation,
      notionIssue.port,
      'https://x',
      silentLogger(),
    );

    const outcome = await service.pollPendingIssues(new Date());

    // 실패한 이슈도 조회 건수에는 잡혀야 로그로 "찾았지만 못 만들었다"를 구분할 수 있다.
    expect(outcome).toEqual({ found: 2, provisioned: 1 });
    expect(notionIssue.writes.map((w) => w.issueId)).toEqual(['ok']);
  });
});
