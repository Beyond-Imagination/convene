import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveAiWorkerBaseUrl } from '@/config/ai-worker.config';
import { PartialTranscriptionScheduler } from '@/recording/application/partial-transcription.scheduler';
import { RecordingService } from '@/recording/application/recording.service';
import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { RedisPartialTranscriptStore } from '@/recording/infrastructure/redis-partial-transcript.store';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

/**
 * Recording 기능을 구성하는 NestJS 모듈.
 *
 * - `RecordingService`는 비-Nest class 라 `useFactory`로 묶는다.
 * - `RecordingReportLifecycleListener`는 Reports BC가 발행한 이벤트를 구독해 STT 호출을 트리거한다.
 * - 오디오 버퍼는 redis LIST로 누적하고 consume 시점에 즉시 폐기한다.
 * - transcriber는 ai-worker HTTP 어댑터 `HttpTranscriber`를 default provider로 둔다.
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
        logger: PinoLogger,
      ) =>
        new RecordingService({
          audioBufferRepository,
          partialTranscriptStore,
          transcriber,
          eventPublisher,
          logger: new PinoLoggerAdapter(logger, RecordingService.name),
        }),
      inject: [
        RedisAudioBufferRepository,
        RedisPartialTranscriptStore,
        HttpTranscriber,
        NestEventBusDomainEventPublisher,
        PinoLogger,
      ],
    },
    {
      provide: PartialTranscriptionScheduler,
      useFactory: (
        audioBufferRepository: RedisAudioBufferRepository,
        transcriber: HttpTranscriber,
        partialTranscriptStore: RedisPartialTranscriptStore,
        logger: PinoLogger,
      ) =>
        new PartialTranscriptionScheduler({
          audioBufferRepository,
          transcriber,
          partialTranscriptStore,
          logger: new PinoLoggerAdapter(logger, PartialTranscriptionScheduler.name),
        }),
      inject: [RedisAudioBufferRepository, HttpTranscriber, RedisPartialTranscriptStore, PinoLogger],
    },
  ],
  // Mediasoup BC의 audio capture 어댑터가 같은 AudioBufferRepository 인스턴스로 chunk를 append 하기 위해 export 한다.
  exports: [RedisAudioBufferRepository],
})
export class RecordingModule {}
