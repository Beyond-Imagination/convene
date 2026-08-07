import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { transcriptSegment } from '@/reports/domain/entries/transcript-segment';
import { ReportTranscriptionCompletedPayload, ReportTranscriptionFailedPayload } from '@/shared-kernel/domain/domain-event.payloads';

import { ReportFinalizationService } from './report-finalization.service';

/**
 * Recording BC가 발행하는 STT 결과 이벤트를 구독해 회의록 파이프라인을 한 단계 진행시키는 Reports BC application listener.
 */
@Injectable()
export class ReportPipelineListener {
  constructor(private readonly service: ReportFinalizationService) {}

  @OnEvent(REPORT_EVENTS.TRANSCRIPTION_COMPLETED)
  async onTranscriptionCompleted(payload: ReportTranscriptionCompletedPayload): Promise<void> {
    const transcript = payload.transcript.map((seg) => transcriptSegment(seg));
    await this.service.completeTranscription({
      reportId: payload.reportId,
      transcript,
    });
  }

  @OnEvent(REPORT_EVENTS.TRANSCRIPTION_FAILED)
  async onTranscriptionFailed(payload: ReportTranscriptionFailedPayload): Promise<void> {
    await this.service.failTranscription({
      reportId: payload.reportId,
      error: payload.error,
    });
  }
}
