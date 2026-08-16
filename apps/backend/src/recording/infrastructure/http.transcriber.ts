import { Injectable } from '@nestjs/common';

import { TranscriberInput, TranscriberPort } from '@/recording/domain/ports/transcriber.port';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { isRetryableHttpStatus, withRetry } from '@/shared-kernel/infrastructure/retry';

export interface HttpTranscriberOptions {
  readonly baseUrl: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
}

class AiWorkerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AiWorkerApiError';
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiWorkerApiError) return isRetryableHttpStatus(error.status);
  // fetch 자체의 reject — ai-worker 재기동 중이거나 네트워크가 끊긴 경우.
  return true;
}

/**
 * ai-worker(FastAPI + faster-whisper) HTTP 어댑터.
 *
 * redis에서 consume 한 audio Buffer를 `POST {baseUrl}/transcribe`에 raw body(application/octet-stream)로 보내고,
 * `{ segments: [{ text, startMs, endMs }] }`를 받아 그대로 돌려준다.
 *
 * 전사 시간이 오디오 길이에 따라 크게 달라져 요청 타임아웃은 두지 않는다.
 */
@Injectable()
export class HttpTranscriber implements TranscriberPort {
  constructor(
    private readonly options: HttpTranscriberOptions,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    private readonly logger: PinoLoggerAdapter | null = null,
  ) {}

  async transcribe(input: TranscriberInput): Promise<ReadonlyArray<TranscriptionSegmentPayload>> {
    // chunk 하나가 throw 하면 RecordingService가 전사 전체를 포기한다. ai-worker 재기동은 여기서 흡수한다.
    const payload = await withRetry(
      {
        maxAttempts: this.options.maxAttempts,
        baseDelayMs: this.options.retryBaseDelayMs,
        isRetryable,
        onRetry: (attempt, delayMs, error) =>
          this.logger?.warn(
            { meetingCode: input.meetingCode, attempt, delayMs, err: error },
            'ai-worker transcribe retrying',
          ),
      },
      () => this.request(input),
    );

    return payload.segments ?? [];
  }

  private async request(
    input: TranscriberInput,
  ): Promise<{ segments?: TranscriptionSegmentPayload[] }> {
    const response = await this.fetchFn(`${this.options.baseUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        // 벤치 샘플을 화자별로 묶기 위한 식별자. ai-worker 는 덤프가 켜졌을 때만 쓴다.
        'X-Meeting-Code': input.meetingCode,
        'X-Participant-Id': input.participantId,
      },
      body: input.audio,
    });

    if (!response.ok) {
      // 재시도까지 소진하면 RecordingService가 catch 해 report.transcription.failed로 발행한다.
      throw new AiWorkerApiError(
        response.status,
        `ai-worker /transcribe 응답이 실패했습니다: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as { segments?: TranscriptionSegmentPayload[] };
  }
}
