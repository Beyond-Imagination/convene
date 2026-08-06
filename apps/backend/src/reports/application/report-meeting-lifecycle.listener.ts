import { MEETING_EVENTS } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { MeetingEndedPayload } from '@/shared-kernel/domain/events/meeting-ended.payload';

import { ReportFinalizationService } from './report-finalization.service';

/**
 * Meeting BC의 `meeting.ended` 이벤트를 구독해 Reports BC의 회의록 draft 생성을 트리거하는 application listener.
 */
@Injectable()
export class ReportMeetingLifecycleListener {
  constructor(private readonly service: ReportFinalizationService) {}

  @OnEvent(MEETING_EVENTS.ENDED)
  async onMeetingEnded(payload: MeetingEndedPayload): Promise<void> {
    await this.service.createDraft({
      meetingId: payload.code,
      code: payload.code,
      source: payload.source,
      meetingType: payload.meetingType,
      externalReference: payload.externalReference,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      participants: payload.participants.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
      chat: payload.chat,
      title: payload.title,
    });
  }
}
