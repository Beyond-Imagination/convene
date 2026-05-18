import { Module } from '@nestjs/common';

import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { RecordingService } from '@/recording/application/recording.service';
import { InMemoryAudioBufferRepository } from '@/recording/infrastructure/in-memory-audio-buffer.repository';
import { NoopTranscriber } from '@/recording/infrastructure/noop.transcriber';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';

/**
 * Recording bounded context 의 NestJS 모듈.
 *
 * - `RecordingService` 는 비-Nest class 라 `useFactory` 로 묶는다
 *   (Meeting/Mediasoup/Reports BC 와 동일 패턴).
 * - `RecordingReportLifecycleListener` 는 Reports BC 가 발행한
 *   `report.transcription.requested` 를 구독해 STT 호출을 트리거한다.
 * - v1 부트스트랩에서는 in-memory 버퍼 + Noop transcriber 를 default provider 로 둔다.
 *   ai-worker(faster-whisper) HTTP 어댑터가 준비되면 provider 토큰만 교체한다.
 */
@Module({
  providers: [
    InMemoryAudioBufferRepository,
    NoopTranscriber,
    RecordingReportLifecycleListener,
    {
      provide: RecordingService,
      useFactory: (
        audioBufferRepository: InMemoryAudioBufferRepository,
        transcriber: NoopTranscriber,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new RecordingService({
          audioBufferRepository,
          transcriber,
          eventPublisher,
        }),
      inject: [InMemoryAudioBufferRepository, NoopTranscriber, NestEventBusDomainEventPublisher],
    },
  ],
})
export class RecordingModule {}
