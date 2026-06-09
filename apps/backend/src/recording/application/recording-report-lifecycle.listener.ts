import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ReportTranscriptionRequestedPayload } from '@/shared-kernel/domain/events';

import { RecordingService } from './recording.service';

/**
 * Reports BC의 이벤트를 구독해 Recording BC의 STT 호출을 트리거하는 application listener.
 */
@Injectable()
export class RecordingReportLifecycleListener {
  private readonly logger = new Logger(RecordingReportLifecycleListener.name);

  constructor(private readonly service: RecordingService) {}

  @OnEvent(REPORT_EVENTS.TRANSCRIPTION_REQUESTED)
  async onTranscriptionRequested(payload: ReportTranscriptionRequestedPayload): Promise<void> {
    await this.service.requestTranscription({
      reportId: payload.reportId,
      meetingCode: payload.code,
      meetingStartedAtMs: payload.meetingStartedAtMs,
      participantNames: payload.participantNames,
    });
  }
}
