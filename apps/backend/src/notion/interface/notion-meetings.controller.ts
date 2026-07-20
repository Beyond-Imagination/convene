import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Post,
  Query,
  Redirect,
  UnauthorizedException,
} from '@nestjs/common';

import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionMeetingParamsDto } from '@/notion/interface/dto/notion-meeting-params.dto';
import { NotionSignatureVerifier } from '@/notion/interface/notion-signature';

interface RedirectResponse {
  readonly url: string;
  readonly statusCode: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderConfirmPage(issueId: string, sig: string): string {
  const id = escapeHtml(issueId);
  const s = escapeHtml(sig);
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>회의 생성</title></head>
<body style="font-family:sans-serif;display:flex;min-height:90vh;align-items:center;justify-content:center">
  <form method="post" action="/notion/meetings" style="text-align:center">
    <p>이 이슈의 회의를 생성합니다.</p>
    <input type="hidden" name="issueId" value="${id}" />
    <input type="hidden" name="sig" value="${s}" />
    <button type="submit" style="padding:.75rem 1.5rem;font-size:1rem;cursor:pointer">회의 생성하기</button>
  </form>
</body>
</html>`;
}

// 노션 버튼이 여는 서명된 공개 엔드포인트. 서명 시크릿이 있을 때만 모듈에 등록된다.
@Controller('notion')
export class NotionMeetingsController {
  constructor(
    private readonly provisioning: NotionMeetingProvisioningService,
    private readonly signature: NotionSignatureVerifier,
  ) {}

  // GET은 부작용이 없어야 한다(링크 언펄링·프리페치·크롤러가 자동 실행). 실제 생성은 폼의 POST가 한다.
  @Get('meetings')
  @Header('Content-Type', 'text/html; charset=utf-8')
  confirmPage(@Query() query: NotionMeetingParamsDto): string {
    this.assertValidSignature(query.issueId, query.sig);
    return renderConfirmPage(query.issueId, query.sig);
  }

  @Post('meetings')
  @Redirect()
  async createFromIssue(@Body() body: NotionMeetingParamsDto): Promise<RedirectResponse> {
    this.assertValidSignature(body.issueId, body.sig);
    const { url } = await this.provisioning.provisionForIssue(body.issueId, null, {
      bestEffortLink: true,
    });
    return { url, statusCode: HttpStatus.FOUND };
  }

  private assertValidSignature(issueId: string, sig: string): void {
    if (!this.signature.verify(issueId, sig)) {
      throw new UnauthorizedException('유효하지 않은 서명입니다');
    }
  }
}
