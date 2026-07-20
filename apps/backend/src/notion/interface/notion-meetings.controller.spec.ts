import { UnauthorizedException } from '@nestjs/common';

import { NotionMeetingProvisioningService, ProvisionResult } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionMeetingQueryDto } from '@/notion/interface/dto/notion-meeting-query.dto';
import { NotionMeetingsController } from '@/notion/interface/notion-meetings.controller';
import { NotionSignatureVerifier, signIssue } from '@/notion/interface/notion-signature';

const SECRET = 's3cr3t';

function fakeProvisioning(url: string): {
  service: NotionMeetingProvisioningService;
  calls: { issueId: string; title: string | null; options: unknown }[];
} {
  const calls: { issueId: string; title: string | null; options: unknown }[] = [];
  const service = {
    provisionForIssue: async (
      issueId: string,
      title: string | null,
      options?: unknown,
    ): Promise<ProvisionResult> => {
      calls.push({ issueId, title, options });
      return { issueId, code: 'ABC', url };
    },
  } as unknown as NotionMeetingProvisioningService;
  return { service, calls };
}

function query(issueId: string, sig: string): NotionMeetingQueryDto {
  const dto = new NotionMeetingQueryDto();
  dto.issueId = issueId;
  dto.sig = sig;
  return dto;
}

describe('NotionMeetingsController.createFromIssue', () => {
  it('서명이 유효하면 회의를 생성하고 생성된 링크로 302 redirect 한다', async () => {
    const { service, calls } = fakeProvisioning('https://convene.example.com/meetings/ABC');
    const controller = new NotionMeetingsController(service, new NotionSignatureVerifier(SECRET));

    const result = await controller.createFromIssue(query('issue-1', signIssue(SECRET, 'issue-1')));

    expect(calls).toEqual([{ issueId: 'issue-1', title: null, options: { bestEffortLink: true } }]);
    expect(result).toEqual({ url: 'https://convene.example.com/meetings/ABC', statusCode: 302 });
  });

  it('서명이 무효면 UnauthorizedException을 던지고 회의를 생성하지 않는다', async () => {
    const { service, calls } = fakeProvisioning('https://x');
    const controller = new NotionMeetingsController(service, new NotionSignatureVerifier(SECRET));

    await expect(controller.createFromIssue(query('issue-1', 'forged'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(calls).toEqual([]);
  });
});
