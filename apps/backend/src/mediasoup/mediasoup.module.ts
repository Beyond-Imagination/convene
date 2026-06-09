import { forwardRef, Module } from '@nestjs/common';

import {
  MEDIA_CODECS,
  resolveNumWorkers,
  resolveParticipantsPerRouter,
  resolveWebRtcTransportOptions,
  resolveWorkerOptions,
} from '@/config/mediasoup.config';
import { MediasoupMeetingLifecycleListener } from '@/mediasoup/application/mediasoup-meeting-lifecycle.listener';
import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import { FfmpegAudioCaptureAdapter } from '@/mediasoup/infrastructure/ffmpeg-audio-capture.adapter';
import { MediasoupRouterAdapter } from '@/mediasoup/infrastructure/mediasoup-router.adapter';
import { MediasoupTransportAdapter } from '@/mediasoup/infrastructure/mediasoup-transport.adapter';
import { MediasoupWorkerPool } from '@/mediasoup/infrastructure/mediasoup-worker.pool';
import { RedisParticipantMediaRepository } from '@/mediasoup/infrastructure/redis-participant-media.repository';
import { MediasoupGateway } from '@/mediasoup/interface/gateways/mediasoup.gateway';
import { RedisAudioBufferRepository } from '@/recording/infrastructure/redis-audio-buffer.repository';
import { RecordingModule } from '@/recording/recording.module';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';

/**
 * Mediasoup 기능을 구성하는 NestJS 모듈.
 *
 * - WorkerPool / RouterAdapter / TransportAdapter / SignalingService 는 비-Nest
 *   클래스라 useFactory 로 묶는다.
 * - Gateway / LifecycleListener / RedisParticipantMediaRepository 는 @Injectable
 *   / @WebSocketGateway 데코레이터가 있으므로 클래스 토큰만 등록한다. Redis 클라이언트는
 *   RedisModule(@Global) 이 제공하므로 imports 추가 없이 inject 가능.
 * - SharedKernelModule 의 NestEventBusDomainEventPublisher 가 도메인 이벤트 publish
 *   채널.
 * - `FfmpegAudioCaptureAdapter` 는 audio producer 의 RTP 를 PlainTransport + ffmpeg
 *   pipeline 으로 capture 해 RecordingModule 의 `AudioBufferRepository` 로 흘려보낸다.
 *   cross-BC 결합은 Port 인터페이스 한정.
 */
@Module({
  imports: [forwardRef(() => RecordingModule)],
  providers: [
    MediasoupGateway,
    MediasoupMeetingLifecycleListener,
    RedisParticipantMediaRepository,
    {
      provide: MediasoupWorkerPool,
      useFactory: () =>
        // useFactory 호출 시점은 NestFactory.create 가 ConfigModule.forRoot()
        // 의 .env 로딩을 끝낸 뒤이므로, 그때 resolve* 가 정확한 env 를 읽는다.
        new MediasoupWorkerPool({
          numWorkers: resolveNumWorkers(),
          worker: resolveWorkerOptions(),
        }),
    },
    {
      provide: MediasoupRouterAdapter,
      useFactory: (workerPool: MediasoupWorkerPool) =>
        new MediasoupRouterAdapter(workerPool, {
          participantsPerRouter: resolveParticipantsPerRouter(),
          mediaCodecs: MEDIA_CODECS,
        }),
      inject: [MediasoupWorkerPool],
    },
    {
      provide: MediasoupTransportAdapter,
      useFactory: (routerAdapter: MediasoupRouterAdapter) =>
        new MediasoupTransportAdapter(routerAdapter, resolveWebRtcTransportOptions()),
      inject: [MediasoupRouterAdapter],
    },
    {
      provide: FfmpegAudioCaptureAdapter,
      useFactory: (
        routerAdapter: MediasoupRouterAdapter,
        audioBufferRepository: RedisAudioBufferRepository,
      ) => new FfmpegAudioCaptureAdapter(routerAdapter, audioBufferRepository),
      inject: [MediasoupRouterAdapter, RedisAudioBufferRepository],
    },
    {
      provide: MediasoupSignalingService,
      useFactory: (
        routerPort: MediasoupRouterAdapter,
        transportPort: MediasoupTransportAdapter,
        participantMediaRepository: RedisParticipantMediaRepository,
        audioCapture: FfmpegAudioCaptureAdapter,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new MediasoupSignalingService({
          routerPort,
          transportPort,
          participantMediaRepository,
          audioCapture,
          eventPublisher,
        }),
      inject: [
        MediasoupRouterAdapter,
        MediasoupTransportAdapter,
        RedisParticipantMediaRepository,
        FfmpegAudioCaptureAdapter,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class MediasoupModule {}
