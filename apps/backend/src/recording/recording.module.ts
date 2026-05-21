import { Module } from '@nestjs/common';

import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { RecordingService } from '@/recording/application/recording.service';
import { NoopTranscriber } from '@/recording/infrastructure/noop.transcriber';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';

/**
 * Recording bounded context 의 NestJS 모듈.
 *
 * - `RecordingService` 는 비-Nest class 라 `useFactory` 로 묶는다
 *   (Meeting/Mediasoup/Reports BC 와 동일 패턴).
 * - `RecordingReportLifecycleListener` 는 Reports BC 가 발행한
 *   `report.transcription.requested` 를 구독해 STT 호출을 트리거한다.
 * - 오디오 버퍼는 redis(ioredis) LIST 로 누적하고 consume 시점에 즉시 폐기한다
 *   (PLAN.md §3). transcriber 는 ai-worker HTTP 어댑터가 준비되기 전까지
 *   Noop 가 default provider 이다.
 */
@Module({
  providers: [
    RedisAudioBufferRepository,
    NoopTranscriber,
    RecordingReportLifecycleListener,
    {
      provide: RecordingService,
      useFactory: (
        audioBufferRepository: RedisAudioBufferRepository,
        transcriber: NoopTranscriber,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new RecordingService({
          audioBufferRepository,
          transcriber,
          eventPublisher,
        }),
      inject: [RedisAudioBufferRepository, NoopTranscriber, NestEventBusDomainEventPublisher],
    },
  ],
})
export class RecordingModule {}
