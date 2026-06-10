import { Injectable, Logger } from '@nestjs/common';

import { TranscriberInput, TranscriberPort } from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

@Injectable()
export class NoopTranscriber implements TranscriberPort {
  private readonly logger = new Logger(NoopTranscriber.name);

  async transcribe(_input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>> {
    this.logger.warn('NoopTranscriber(테스트 픽스처)가 호출되었습니다. 빈 transcript를 반환합니다.');
    return [];
  }
}
