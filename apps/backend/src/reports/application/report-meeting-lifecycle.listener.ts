import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { MEETING_EVENTS } from '@migration/shared-interfaces';

import { MeetingEndedPayload } from '@/shared-kernel/domain/events';

import { ReportFinalizationService } from './report-finalization.service';

/**
 * Meeting BC의 `meeting.ended` 이벤트를 구독해 Reports BC의 회의록 draft
 * 생성을 트리거하는 application listener.
 *
 * 두 BC는 본 listener 외 직접 의존을 갖지 않으며 `MeetingEndedPayload`
 * 인터페이스 하나로만 결합한다(CLAUDE.md hard rule 7).
 */
@Injectable()
export class ReportMeetingLifecycleListener {
  private readonly logger = new Logger(ReportMeetingLifecycleListener.name);

  constructor(private readonly service: ReportFinalizationService) {}

  @OnEvent(MEETING_EVENTS.ENDED)
  async onMeetingEnded(_payload: MeetingEndedPayload): Promise<void> {
    throw new Error('ReportMeetingLifecycleListener.onMeetingEnded not implemented');
  }
}
