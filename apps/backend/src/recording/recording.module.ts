import { Module } from '@nestjs/common';

import { resolveAiWorkerBaseUrl } from '@/config/ai-worker.config';
import { PartialTranscriptionScheduler } from '@/recording/application/partial-transcription.scheduler';
import { RecordingService } from '@/recording/application/recording.service';
import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { AUDIO_BUFFER_REPOSITORY } from '@/recording/domain/ports/audio-buffer.repository';
import { PARTIAL_TRANSCRIPT_STORE } from '@/recording/domain/ports/partial-transcript.store';
import { TRANSCRIBER } from '@/recording/domain/ports/transcriber.port';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { RedisPartialTranscriptStore } from '@/recording/infrastructure/redis-partial-transcript.store';

/**
 * Recording 기능을 구성하는 NestJS 모듈.
 *
 * - `RecordingReportLifecycleListener`는 Reports BC가 발행한 이벤트를 구독해 STT 호출을 트리거한다.
 * - 오디오 버퍼는 redis LIST로 누적하고 consume 시점에 즉시 폐기한다.
 * - transcriber는 ai-worker HTTP 어댑터 `HttpTranscriber`를 default provider로 둔다.
 */
@Module({
  providers: [
    RecordingService,
    PartialTranscriptionScheduler,
    RecordingReportLifecycleListener,
    RedisAudioBufferRepository,
    { provide: AUDIO_BUFFER_REPOSITORY, useExisting: RedisAudioBufferRepository },
    { provide: PARTIAL_TRANSCRIPT_STORE, useClass: RedisPartialTranscriptStore },
    // ai-worker base URL이 런타임 설정이라 동적 생성이 필요하다.
    { provide: TRANSCRIBER, useFactory: () => new HttpTranscriber(resolveAiWorkerBaseUrl()) },
  ],
  // Mediasoup BC의 audio capture 어댑터가 같은 AudioBufferRepository 인스턴스로 chunk를 append 하기 위해 export 한다.
  exports: [AUDIO_BUFFER_REPOSITORY],
})
export class RecordingModule {}
