import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { transcriptSegment } from '@/reports/domain/entries';
import {
  ReportTranscriptionCompletedPayload,
  ReportTranscriptionFailedPayload,
} from '@/shared-kernel/domain/events';

import { ReportFinalizationService } from './report-finalization.service';

/**
 * Recording BC 가 발행하는 STT 결과 이벤트를 구독해 회의록 파이프라인을
 * 한 단계 진행시키는 Reports BC application listener.
 *
 * payload 의 plain transcript 구조를 도메인 `TranscriptSegment` VO 로 변환해
 * Aggregate 의 불변식을 통과시킨 뒤 Application Service 에 위임한다.
 * 두 BC 는 본 listener 외 직접 의존을 갖지 않는다(CLAUDE.md hard rule 7).
 */
@Injectable()
export class ReportPipelineListener {
  private readonly logger = new Logger(ReportPipelineListener.name);

  constructor(private readonly service: ReportFinalizationService) {}

  @OnEvent(REPORT_EVENTS.TRANSCRIPTION_COMPLETED)
  async onTranscriptionCompleted(_payload: ReportTranscriptionCompletedPayload): Promise<void> {
    throw new Error('ReportPipelineListener.onTranscriptionCompleted not implemented');
  }

  @OnEvent(REPORT_EVENTS.TRANSCRIPTION_FAILED)
  async onTranscriptionFailed(_payload: ReportTranscriptionFailedPayload): Promise<void> {
    throw new Error('ReportPipelineListener.onTranscriptionFailed not implemented');
  }
}
