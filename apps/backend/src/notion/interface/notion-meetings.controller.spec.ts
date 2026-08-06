import { UnauthorizedException } from '@nestjs/common';

import { NotionMeetingProvisioningService, ProvisionResult } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionMeetingParamsDto } from '@/notion/interface/notion-meeting-params.dto';
import { NotionMeetingsController } from '@/notion/interface/notion-meetings.controller';
import { NotionSignatureVerifier, signIssue } from '@/notion/interface/notion-signature';
import { stub } from '@/shared-kernel/testing/stub';

const SECRET = 's3cr3t';

function fakeProvisioning(url: string): {
  service: NotionMeetingProvisioningService;
  calls: { issueId: string; title: string | null; options: unknown }[];
} {
  const calls: { issueId: string; title: string | null; options: unknown }[] = [];
  const service = stub<NotionMeetingProvisioningService>({
    provisionForIssue: async (
      issueId: string,
      title: string | null,
      options?: unknown,
    ): Promise<ProvisionResult> => {
      calls.push({ issueId, title, options });
      return { issueId, code: 'ABC', url };
    },
  });
  return { service, calls };
}

function params(issueId: string, sig: string): NotionMeetingParamsDto {
  const dto = new NotionMeetingParamsDto();
  dto.issueId = issueId;
  dto.sig = sig;
  return dto;
}

describe('NotionMeetingsController.confirmPage (GET)', () => {
  it('서명이 유효하면 회의를 생성하지 않고 POST 확인 폼 HTML만 렌더한다(안전한 GET)', () => {
    const { service, calls } = fakeProvisioning('https://x');
    const controller = new NotionMeetingsController(service, new NotionSignatureVerifier(SECRET));

    const html = controller.confirmPage(params('issue-1', signIssue(SECRET, 'issue-1')));

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/notion/meetings"');
    expect(html).toContain('issue-1');
    expect(calls).toEqual([]);
  });

  it('값을 HTML 이스케이프해 렌더한다(XSS 방지)', () => {
    const controller = new NotionMeetingsController(
      fakeProvisioning('https://x').service,
      new NotionSignatureVerifier(SECRET),
    );
    const issueId = 'a"><script>';

    const html = controller.confirmPage(params(issueId, signIssue(SECRET, issueId)));

    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('서명이 무효면 UnauthorizedException을 던진다', () => {
    const controller = new NotionMeetingsController(
      fakeProvisioning('https://x').service,
      new NotionSignatureVerifier(SECRET),
    );

    expect(() => controller.confirmPage(params('issue-1', 'forged'))).toThrow(UnauthorizedException);
  });
});

describe('NotionMeetingsController.createFromIssue (POST)', () => {
  it('서명이 유효하면 회의를 생성(best-effort 링크)하고 생성된 링크로 302 redirect 한다', async () => {
    const { service, calls } = fakeProvisioning('https://convene.example.com/meetings/ABC');
    const controller = new NotionMeetingsController(service, new NotionSignatureVerifier(SECRET));

    const result = await controller.createFromIssue(params('issue-1', signIssue(SECRET, 'issue-1')));

    expect(calls).toEqual([{ issueId: 'issue-1', title: null, options: { bestEffortLink: true } }]);
    expect(result).toEqual({ url: 'https://convene.example.com/meetings/ABC', statusCode: 302 });
  });

  it('서명이 무효면 UnauthorizedException을 던지고 회의를 생성하지 않는다', async () => {
    const { service, calls } = fakeProvisioning('https://x');
    const controller = new NotionMeetingsController(service, new NotionSignatureVerifier(SECRET));

    await expect(controller.createFromIssue(params('issue-1', 'forged'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(calls).toEqual([]);
  });
});
