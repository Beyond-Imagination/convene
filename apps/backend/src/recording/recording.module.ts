import { Module } from '@nestjs/common';

import { resolveAiWorkerBaseUrl } from '@/config/ai-worker.config';
import { PartialTranscriptionScheduler } from '@/recording/application/partial-transcription.scheduler';
import { RecordingService } from '@/recording/application/recording.service';
import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { RedisPartialTranscriptStore } from '@/recording/infrastructure/redis-partial-transcript.store';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';

/**
 * Recording bounded context 의 NestJS 모듈.
 *
 * - `RecordingService` 는 비-Nest class 라 `useFactory` 로 묶는다
 *   (Meeting/Mediasoup/Reports BC 와 동일 패턴).
 * - `RecordingReportLifecycleListener` 는 Reports BC 가 발행한
 *   `report.transcription.requested` 를 구독해 STT 호출을 트리거한다.
 * - 오디오 버퍼는 redis(ioredis) LIST 로 누적하고 consume 시점에 즉시 폐기한다
 *   (PLAN.md §3). transcriber 는 ai-worker(FastAPI + faster-whisper) HTTP 어댑터
 *   `HttpTranscriber` 를 default provider 로 둔다. e2e 에서는 `overrideProvider`
 *   로 NoopTranscriber 를 주입해 ai-worker 컨테이너 없이도 통과시킨다.
 */
@Module({
  providers: [
    RedisAudioBufferRepository,
    RedisPartialTranscriptStore,
    {
      provide: HttpTranscriber,
      useFactory: () => new HttpTranscriber(resolveAiWorkerBaseUrl()),
    },
    RecordingReportLifecycleListener,
    {
      provide: RecordingService,
      useFactory: (
        audioBufferRepository: RedisAudioBufferRepository,
        partialTranscriptStore: RedisPartialTranscriptStore,
        transcriber: HttpTranscriber,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new RecordingService({
          audioBufferRepository,
          partialTranscriptStore,
          transcriber,
          eventPublisher,
        }),
      inject: [
        RedisAudioBufferRepository,
        RedisPartialTranscriptStore,
        HttpTranscriber,
        NestEventBusDomainEventPublisher,
      ],
    },
    {
      provide: PartialTranscriptionScheduler,
      useFactory: (
        audioBufferRepository: RedisAudioBufferRepository,
        transcriber: HttpTranscriber,
        partialTranscriptStore: RedisPartialTranscriptStore,
      ) =>
        new PartialTranscriptionScheduler({
          audioBufferRepository,
          transcriber,
          partialTranscriptStore,
        }),
      inject: [RedisAudioBufferRepository, HttpTranscriber, RedisPartialTranscriptStore],
    },
  ],
  // Mediasoup BC 의 audio capture 어댑터(FfmpegAudioCaptureAdapter)가 같은
  // AudioBufferRepository 인스턴스로 chunk 를 append 하기 위해 export 한다.
  // cross-BC 결합은 Port 인터페이스 의존 한정 (CLAUDE.md hard rule 7).
  exports: [RedisAudioBufferRepository],
})
export class RecordingModule {}
