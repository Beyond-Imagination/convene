import { Injectable } from '@nestjs/common';

import { TranscriberInput, TranscriberPort } from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

/**
 * ai-worker(FastAPI + faster-whisper) HTTP 어댑터.
 *
 * redis에서 consume 한 audio Buffer를 `POST {baseUrl}/transcribe`에 raw body(application/octet-stream)로 보내고,
 * `{ segments: [{ text, startMs, endMs }] }`를 받아 그대로 돌려준다.
 */
@Injectable()
export class HttpTranscriber implements TranscriberPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async transcribe(input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>> {
    const response = await this.fetchFn(`${this.baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: input.audio,
    });

    if (!response.ok) {
      // non-2xx 응답은 RecordingService가 catch 해 report.transcription.failed로 발행한다.
      throw new Error(
        `ai-worker /transcribe 응답이 실패했습니다: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as { segments?: TranscriptionSegmentPayload[] };
    return payload.segments ?? [];
  }
}
