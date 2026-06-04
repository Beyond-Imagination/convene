import { Injectable, Logger } from '@nestjs/common';

import { TranscriberInput, TranscriberPort } from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

/**
 * TranscriberPort 의 부트스트랩 fallback 구현체.
 *
 * ai-worker(faster-whisper) 어댑터가 환경마다 준비돼 있지 않을 수
 * 있어, 어댑터 미설정 상태에서도 회의록 파이프라인이 finalize 까지 진행되도록
 * **빈 transcript** 를 돌려준다. STT 자체는 수행하지 않는다.
 */
@Injectable()
export class NoopTranscriber implements TranscriberPort {
  private readonly logger = new Logger(NoopTranscriber.name);

  async transcribe(_input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>> {
    this.logger.warn(
      'NoopTranscriber 가 호출되었습니다. 실제 STT 어댑터(TranscriberPort)로 교체하세요.',
    );
    return [];
  }
}
