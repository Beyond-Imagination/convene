import { Module } from '@nestjs/common';

import {
  MEDIA_CODECS,
  resolveNumWorkers,
  resolveRoutersPerRoom,
  resolveWebRtcTransportOptions,
  resolveWorkerOptions,
} from '@/config/mediasoup.config';
import { MediasoupMeetingLifecycleListener } from '@/mediasoup/application/mediasoup-meeting-lifecycle.listener';
import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import { InMemoryParticipantMediaRepository } from '@/mediasoup/infrastructure/in-memory-participant-media.repository';
import { MediasoupRouterAdapter } from '@/mediasoup/infrastructure/mediasoup-router.adapter';
import { MediasoupTransportAdapter } from '@/mediasoup/infrastructure/mediasoup-transport.adapter';
import { MediasoupWorkerPool } from '@/mediasoup/infrastructure/mediasoup-worker.pool';
import { MediasoupGateway } from '@/mediasoup/interface/gateways/mediasoup.gateway';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';

/**
 * Mediasoup bounded context 의 NestJS 모듈.
 *
 * - WorkerPool / RouterAdapter / TransportAdapter / SignalingService 는 비-Nest
 *   클래스라 useFactory 로 묶는다 (Meeting BC 의 MeetingService 와 동일 패턴).
 * - Gateway / LifecycleListener / InMemoryRepo 는 @Injectable / @WebSocketGateway
 *   데코레이터가 있으므로 클래스 토큰만 등록.
 * - SharedKernelModule 의 NestEventBusDomainEventPublisher 가 도메인 이벤트 publish
 *   채널 ([[gateway-shared-config]]).
 */
@Module({
  providers: [
    MediasoupGateway,
    MediasoupMeetingLifecycleListener,
    InMemoryParticipantMediaRepository,
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
          routersPerRoom: resolveRoutersPerRoom(),
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
      provide: MediasoupSignalingService,
      useFactory: (
        routerPort: MediasoupRouterAdapter,
        transportPort: MediasoupTransportAdapter,
        participantMediaRepository: InMemoryParticipantMediaRepository,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new MediasoupSignalingService({
          routerPort,
          transportPort,
          participantMediaRepository,
          eventPublisher,
        }),
      inject: [
        MediasoupRouterAdapter,
        MediasoupTransportAdapter,
        InMemoryParticipantMediaRepository,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class MediasoupModule {}
