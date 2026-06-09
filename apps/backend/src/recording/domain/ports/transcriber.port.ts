import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

/**
 * STT(Speech-to-Text) 어댑터의 도메인 포트.
 *
 */
export interface TranscriberPort {
  transcribe(input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>>;
}

export interface TranscriberInput {
  readonly meetingCode: string;
  readonly audio: Buffer;
}
