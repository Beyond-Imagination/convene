import { Controller, Get, HttpStatus, Query, Redirect, UnauthorizedException } from '@nestjs/common';

import { NotionMeetingProvisioningService } from '@/notion/application/notion-meeting-provisioning.service';
import { NotionMeetingQueryDto } from '@/notion/interface/dto/notion-meeting-query.dto';
import { NotionSignatureVerifier } from '@/notion/interface/notion-signature';

interface RedirectResponse {
  readonly url: string;
  readonly statusCode: number;
}

// 노션 버튼이 여는 서명된 공개 GET. 서명 시크릿이 있을 때만 모듈에 등록된다.
@Controller('notion')
export class NotionMeetingsController {
  constructor(
    private readonly provisioning: NotionMeetingProvisioningService,
    private readonly signature: NotionSignatureVerifier,
  ) {}

  @Get('meetings')
  @Redirect()
  async createFromIssue(@Query() query: NotionMeetingQueryDto): Promise<RedirectResponse> {
    if (!this.signature.verify(query.issueId, query.sig)) {
      throw new UnauthorizedException('유효하지 않은 서명입니다');
    }
    const { url } = await this.provisioning.provisionForIssue(query.issueId, null, {
      bestEffortLink: true,
    });
    return { url, statusCode: HttpStatus.FOUND };
  }
}
