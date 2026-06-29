import { MEETING_EVENTS } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { MediasoupSignalingService } from './mediasoup-signaling.service';

interface MeetingCreatedPayload {
  code: string;
}
interface ParticipantJoinedPayload {
  code: string;
  participantId: string;
}
interface ParticipantLeftPayload {
  code: string;
  participantId: string;
}
interface MeetingEndedPayload {
  code: string;
}

/**
 * Meeting BC의 도메인 이벤트를 구독해 Mediasoup BC의 lifecycle을 트리거하는 application listener.
 */
@Injectable()
export class MediasoupMeetingLifecycleListener {
  constructor(private readonly service: MediasoupSignalingService) {}

  @OnEvent(MEETING_EVENTS.CREATED)
  async onMeetingCreated(payload: MeetingCreatedPayload): Promise<void> {
    await this.service.openRoom({ meetingCode: payload.code });
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_JOINED)
  async onParticipantJoined(payload: ParticipantJoinedPayload): Promise<void> {
    await this.service.admitParticipant({
      meetingCode: payload.code,
      participantId: payload.participantId,
    });
  }

  @OnEvent(MEETING_EVENTS.PARTICIPANT_LEFT)
  async onParticipantLeft(payload: ParticipantLeftPayload): Promise<void> {
    await this.service.dismissParticipant({
      meetingCode: payload.code,
      participantId: payload.participantId,
    });
  }

  @OnEvent(MEETING_EVENTS.ENDED)
  async onMeetingEnded(payload: MeetingEndedPayload): Promise<void> {
    await this.service.closeRoom({ meetingCode: payload.code });
  }
}
