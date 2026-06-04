import { Injectable } from '@nestjs/common';

import { TranscriberInput, TranscriberPort } from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';

/**
 * ai-worker(FastAPI + faster-whisper) HTTP 어댑터.
 *
 * `TranscriberPort` 의 구현체. backend 가 redis 에서 consume 한 audio Buffer 를
 * `POST {baseUrl}/transcribe` 에 raw body(application/octet-stream)로 보내고,
 * `{ segments: [{ text, startMs, endMs }] }` 를 받아 그대로 돌려준다.
 *
 * 디스크/공유 volume 미사용 — audio 는 전송 직후 폐기된다.
 *
 * fetch 는 Node 18+ global API 를 사용하되 constructor 2번째 인자로 주입 가능해
 * spec 에서 jest.fn() 으로 손쉽게 mock 한다.
 */
@Injectable()
export class HttpTranscriber implements TranscriberPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async transcribe(
    input: TranscriberInput,
  ): Promise<ReadonlyArray<TranscriptionSegmentPayload>> {
    const response = await this.fetchFn(`${this.baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: input.audio,
    });

    if (!response.ok) {
      // non-2xx 응답은 RecordingService 가 catch 해 report.transcription.failed 로
      // 발행한다(application/recording.service.ts 의 try/catch).
      throw new Error(
        `ai-worker /transcribe 응답이 실패했습니다: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as { segments?: TranscriptionSegmentPayload[] };
    return payload.segments ?? [];
  }
}
