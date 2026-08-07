import type {
  CloseMeetingResponse,
  CreateMeetingResponse,
  MeetingDetailResponse,
} from '@convene/shared-interfaces';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { CreateMeetingDto } from '@/meeting/interface/meeting.dto';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

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
      meetingType: dto.meetingType,
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

  @Get(':code')
  async getMeeting(@Param('code') code: string): Promise<MeetingDetailResponse> {
    this.assertCodeFormat(code);
    const meeting = await this.service.getMeeting(code);
    return {
      code: meeting.code.value,
      title: meeting.title,
      status: meeting.status,
      participantCount: meeting.activeParticipantCount,
      // 예약 회의의 startedAt은 생성 시각이라 "방이 열린 시각"이 아니다.
      startedAt: meeting.status === 'scheduled' ? null : meeting.startedAt.toISOString(),
      endedAt: meeting.endedAt?.toISOString() ?? null,
    };
  }

  @Delete(':code')
  @HttpCode(HttpStatus.OK)
  async closeMeeting(
    @Param('code') code: string,
    @Headers('x-host-token') hostToken?: string,
  ): Promise<CloseMeetingResponse> {
    this.assertCodeFormat(code);
    const meeting = await this.service.closeMeeting({
      code,
      reason: 'manual',
      hostToken: hostToken ?? '',
    });
    return {
      code: meeting.code.value,
      endedAt: meeting.endedAt!.toISOString(),
    };
  }

  // 형식 위반은 도메인 에러가 아니라 클라이언트 요청 오류이므로 BadRequestException으로 매핑.
  // 도메인 에러(MeetingNotFound/NotHost)는 DomainExceptionFilter가 HTTP로 번역한다.
  private assertCodeFormat(code: string): void {
    try {
      MeetingCode.from(code);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
