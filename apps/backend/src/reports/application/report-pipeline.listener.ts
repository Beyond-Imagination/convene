import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { transcriptSegment } from '@/reports/domain/entries/transcript-segment';
import { ReportNotionPushedPayload, ReportTranscriptionCompletedPayload, ReportTranscriptionFailedPayload } from '@/shared-kernel/domain/domain-event.payloads';

import { ReportFinalizationService } from './report-finalization.service';

/**
 * 다른 BC가 발행하는 이벤트(Recording의 STT 결과, notion의 push 결과)를 받아 회의록을 진행시키는 Reports BC application listener.
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

  @OnEvent(REPORT_EVENTS.NOTION_PUSHED)
  async onNotionPushed(payload: ReportNotionPushedPayload): Promise<void> {
    await this.service.recordNotionPush({
      reportId: payload.reportId,
      pageId: payload.pageId,
      at: payload.at,
    });
  }
}
