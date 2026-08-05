import { forwardRef, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  MEDIA_CODECS,
  resolveNumWorkers,
  resolveParticipantsPerRouter,
  resolveWebRtcTransportOptions,
  resolveWorkerOptions,
} from '@/config/mediasoup.config';
import { MediasoupMeetingLifecycleListener } from '@/mediasoup/application/mediasoup-meeting-lifecycle.listener';
import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import {
  AUDIO_CAPTURE,
  MEDIA_ROUTER,
  MEDIA_TRANSPORT,
  PARTICIPANT_MEDIA_REPOSITORY,
} from '@/mediasoup/domain/ports';
import { FfmpegAudioCaptureAdapter } from '@/mediasoup/infrastructure/ffmpeg-audio-capture.adapter';
import { MediasoupRouterAdapter } from '@/mediasoup/infrastructure/mediasoup-router.adapter';
import { MediasoupTransportAdapter } from '@/mediasoup/infrastructure/mediasoup-transport.adapter';
import { MediasoupWorkerPool } from '@/mediasoup/infrastructure/mediasoup-worker.pool';
import { RedisParticipantMediaRepository } from '@/mediasoup/infrastructure/redis-participant-media.repository';
import { MediasoupGateway } from '@/mediasoup/interface/gateways/mediasoup.gateway';
import { AUDIO_BUFFER_REPOSITORY, AudioBufferRepository } from '@/recording/domain/ports';
import { RecordingModule } from '@/recording/recording.module';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

/**
 * Mediasoup 기능을 구성하는 NestJS 모듈.
 *
 * 인프라 어댑터는 `resolve*`가 읽는 런타임 env에 의존하므로 `useFactory`로 만든다.
 * 팩토리 호출 시점은 NestFactory.create가 ConfigModule.forRoot()의 .env 로딩을 끝낸 뒤라 정확한 값을 읽는다.
 * 팩토리로 만드는 인스턴스는 INQUIRER를 못 쓰므로 로그 context를 명시적으로 넘긴다.
 */
@Module({
  imports: [forwardRef(() => RecordingModule)],
  providers: [
    MediasoupGateway,
    MediasoupMeetingLifecycleListener,
    MediasoupSignalingService,
    { provide: PARTICIPANT_MEDIA_REPOSITORY, useClass: RedisParticipantMediaRepository },
    {
      provide: MediasoupWorkerPool,
      useFactory: (logger: PinoLogger) =>
        new MediasoupWorkerPool(
          { numWorkers: resolveNumWorkers(), worker: resolveWorkerOptions() },
          new PinoLoggerAdapter(logger, MediasoupWorkerPool.name),
        ),
      inject: [PinoLogger],
    },
    {
      provide: MEDIA_ROUTER,
      useFactory: (workerPool: MediasoupWorkerPool, logger: PinoLogger) =>
        new MediasoupRouterAdapter(
          workerPool,
          { participantsPerRouter: resolveParticipantsPerRouter(), mediaCodecs: MEDIA_CODECS },
          new PinoLoggerAdapter(logger, MediasoupRouterAdapter.name),
        ),
      inject: [MediasoupWorkerPool, PinoLogger],
    },
    {
      provide: MEDIA_TRANSPORT,
      useFactory: (routerAdapter: MediasoupRouterAdapter) =>
        new MediasoupTransportAdapter(routerAdapter, resolveWebRtcTransportOptions()),
      inject: [MEDIA_ROUTER],
    },
    {
      provide: AUDIO_CAPTURE,
      useFactory: (
        routerAdapter: MediasoupRouterAdapter,
        audioBufferRepository: AudioBufferRepository,
        logger: PinoLogger,
      ) =>
        new FfmpegAudioCaptureAdapter(
          routerAdapter,
          audioBufferRepository,
          new PinoLoggerAdapter(logger, FfmpegAudioCaptureAdapter.name),
        ),
      inject: [MEDIA_ROUTER, AUDIO_BUFFER_REPOSITORY, PinoLogger],
    },
  ],
})
export class MediasoupModule {}
