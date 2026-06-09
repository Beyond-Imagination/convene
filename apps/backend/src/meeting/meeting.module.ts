import { Module } from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { RandomHostTokenGenerator } from '@/meeting/infrastructure/random-host-token.generator';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { RedisChatRepository } from '@/meeting/infrastructure/redis-chat.repository';
import { RedisMeetingRepository } from '@/meeting/infrastructure/redis-meeting.repository';
import { MeetingController } from '@/meeting/interface/controllers/meeting.controller';
import { MeetingGateway } from '@/meeting/interface/gateways/meeting.gateway';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Meeting 기능을 구성하는 NestJS 모듈.
 *
 * 회의 영속 상태(Meeting Aggregate + ChatEntry LIST)는 redis(ioredis) 기반
 * 어댑터로 저장한다. RedisModule(@Global) 이 ioredis 클라이언트 인스턴스를
 * 한 번 만들어 두고, 본 모듈의 Repository 가 같은 인스턴스를 inject 한다.
 *
 * SystemClock, NestEventBusDomainEventPublisher는 @Global()인 SharedKernelModule을
 * 통해 주입된다(AppModule에서 1회 import).
 *
 * MeetingService는 비-Nest 클래스(생성자에서 deps 객체를 받음)이므로 useFactory로 묶는다.
 */
@Module({
  controllers: [MeetingController],
  providers: [
    RedisMeetingRepository,
    RedisChatRepository,
    RandomMeetingCodeGenerator,
    RandomHostTokenGenerator,
    MeetingGateway,
    {
      provide: MeetingService,
      useFactory: (
        repository: RedisMeetingRepository,
        chatRepository: RedisChatRepository,
        codeGenerator: RandomMeetingCodeGenerator,
        hostTokenGenerator: RandomHostTokenGenerator,
        clock: SystemClock,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new MeetingService({
          repository,
          chatRepository,
          codeGenerator,
          hostTokenGenerator,
          clock,
          eventPublisher,
        }),
      inject: [
        RedisMeetingRepository,
        RedisChatRepository,
        RandomMeetingCodeGenerator,
        RandomHostTokenGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class MeetingModule {}
