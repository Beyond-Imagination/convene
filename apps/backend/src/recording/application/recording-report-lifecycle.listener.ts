import { REPORT_EVENTS } from '@migration/shared-interfaces';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ReportTranscriptionRequestedPayload } from '@/shared-kernel/domain/events';

import { RecordingService } from './recording.service';

/**
 * Reports BC 의 `report.transcription.requested` 이벤트를 구독해 Recording BC 의
 * STT 호출을 트리거하는 application listener.
 *
 * 두 BC 는 본 listener 외 직접 의존을 갖지 않으며 payload 인터페이스로만 결합한다
 * (CLAUDE.md hard rule 7).
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
