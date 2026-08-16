import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { resolveAiWorkerConfig } from '@/config/ai-worker.config';
import { PartialTranscriptionScheduler } from '@/recording/application/partial-transcription.scheduler';
import { RecordingService } from '@/recording/application/recording.service';
import { RecordingReportLifecycleListener } from '@/recording/application/recording-report-lifecycle.listener';
import { AUDIO_BUFFER_REPOSITORY } from '@/recording/domain/ports/audio-buffer.repository';
import { PARTIAL_TRANSCRIPT_STORE } from '@/recording/domain/ports/partial-transcript.store';
import { TRANSCRIBER } from '@/recording/domain/ports/transcriber.port';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { RedisPartialTranscriptStore } from '@/recording/infrastructure/redis-partial-transcript.store';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

/** Reports BC가 발행한 `report.transcription.requested`를 구독해 STT를 트리거한다. */
@Module({
  providers: [
    RecordingService,
    PartialTranscriptionScheduler,
    RecordingReportLifecycleListener,
    RedisAudioBufferRepository,
    { provide: AUDIO_BUFFER_REPOSITORY, useExisting: RedisAudioBufferRepository },
    { provide: PARTIAL_TRANSCRIPT_STORE, useClass: RedisPartialTranscriptStore },
    // ai-worker 접속·재시도 설정이 런타임 값이라 동적 생성이 필요하다.
    {
      provide: TRANSCRIBER,
      useFactory: (logger: PinoLogger) =>
        new HttpTranscriber(
          resolveAiWorkerConfig(),
          globalThis.fetch,
          new PinoLoggerAdapter(logger, HttpTranscriber.name),
        ),
      inject: [PinoLogger],
    },
  ],
  // Mediasoup BC의 audio capture 어댑터가 같은 AudioBufferRepository 인스턴스로 chunk를 append 하기 위해 export 한다.
  exports: [AUDIO_BUFFER_REPOSITORY],
})
export class RecordingModule {}
