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
import { NotionMeetingParamsDto } from '@/notion/interface/notion-meeting-params.dto';
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

// Convene 프론트(홈/입장) 라이트 테마와 통일: surface 카드 + accent 프라이머리 버튼.
function renderConfirmPage(issueId: string, sig: string): string {
  const id = escapeHtml(issueId);
  const s = escapeHtml(sig);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>회의 생성 · Convene</title>
<style>
  :root{--bg:#fff;--surface:#f5f5f5;--border:#e5e5e5;--text:#171717;--muted:#737373;--accent:#3b82f6;--accent-hover:#2563eb;--accent-active:#1d4ed8}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:3rem 1rem;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .card{width:100%;max-width:28rem;border:1px solid var(--border);background:var(--surface);border-radius:.75rem;box-shadow:0 1px 2px 0 rgb(0 0 0/.05);padding:2rem;text-align:center}
  .brand{font-size:1.5rem;font-weight:800;letter-spacing:-.025em}
  .subtitle{margin:.5rem 0 1.75rem;font-size:.875rem;color:var(--muted)}
  .btn{display:inline-flex;align-items:center;justify-content:center;width:100%;border:0;border-radius:.5rem;padding:.7rem 1rem;font-size:.9rem;font-weight:600;color:#fff;background:var(--accent);cursor:pointer;transition:background-color .15s}
  .btn:hover{background:var(--accent-hover)}
  .btn:active{background:var(--accent-active)}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">Convene</div>
    <p class="subtitle">이 노션 이슈의 회의를 생성합니다.</p>
    <form method="post" action="/notion/meetings">
      <input type="hidden" name="issueId" value="${id}" />
      <input type="hidden" name="sig" value="${s}" />
      <button type="submit" class="btn">회의 생성하기</button>
    </form>
  </main>
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
