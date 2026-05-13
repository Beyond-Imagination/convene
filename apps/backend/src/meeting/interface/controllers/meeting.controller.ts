import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import type { CreateMeetingResponse } from '@migration/shared-interfaces';

import { MeetingService } from '@/meeting/application/meeting.service';

import { CreateMeetingDto } from '@/meeting/interface/dto/create-meeting.dto';

/**
 * Meeting bounded context의 HTTP Interface layer.
 * 책임: payload 검증(DTO + ValidationPipe), 도메인 VO 변환, MeetingService 호출,
 * wire format으로 응답 직렬화. 비즈니스 로직은 일체 두지 않는다 (ARCHITECTURE.md §3).
 */
@Controller('meetings')
export class MeetingController {
  constructor(private readonly _service: MeetingService) {
    void this._service;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMeeting(@Body() _dto: CreateMeetingDto): Promise<CreateMeetingResponse> {
    throw new Error('not implemented');
  }
}
