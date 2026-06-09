import type { CloseMeetingResponse, CreateMeetingResponse } from '@convene/shared-interfaces';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';

import { MeetingNotFoundError, NotHostError } from '@/meeting/application/meeting.errors';
import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingCode } from '@/meeting/domain/value-objects';
import { CreateMeetingDto } from '@/meeting/interface/dto/create-meeting.dto';
import { externalReference } from '@/shared-kernel/domain/value-objects';

/**
 * 책임: payload 검증(DTO + ValidationPipe), 도메인 VO 변환, MeetingService 호출, wire format으로 응답 직렬화.
 */
@Controller('meetings')
export class MeetingController {
  constructor(private readonly service: MeetingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMeeting(@Body() dto: CreateMeetingDto): Promise<CreateMeetingResponse> {
    const ref = externalReference({ issueId: dto.externalReference?.issueId });
    const meeting = await this.service.createMeeting({
      source: dto.source,
      externalReference: ref,
      title: dto.title ?? null,
    });
    return {
      code: meeting.code.value,
      source: meeting.source,
      startedAt: meeting.startedAt.toISOString(),
      hostToken: meeting.hostToken,
    };
  }

  @Delete(':code')
  @HttpCode(HttpStatus.OK)
  async closeMeeting(
    @Param('code') code: string,
    @Headers('x-host-token') hostToken?: string,
  ): Promise<CloseMeetingResponse> {
    // 형식 위반은 도메인 에러가 아니라 클라이언트 요청 오류이므로 BadRequestException으로 매핑.
    try {
      MeetingCode.from(code);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    try {
      const meeting = await this.service.closeMeeting({
        code,
        reason: 'manual',
        hostToken: hostToken ?? '',
      });
      return {
        code: meeting.code.value,
        endedAt: meeting.endedAt!.toISOString(),
      };
    } catch (e) {
      if (e instanceof MeetingNotFoundError) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof NotHostError) {
        throw new ForbiddenException(e.message);
      }
      throw e;
    }
  }
}
