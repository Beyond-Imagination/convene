import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingCreationAdapter } from '@/meeting/application/meeting-creation.adapter';
import { MeetingIdleScheduler } from '@/meeting/application/meeting-idle.scheduler';
import { MeetingRecoveryService } from '@/meeting/application/meeting-recovery.service';
import { RandomHostTokenGenerator } from '@/meeting/infrastructure/random-host-token.generator';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { RedisChatRepository } from '@/meeting/infrastructure/redis-chat.repository';
import { RedisMeetingRepository } from '@/meeting/infrastructure/redis-meeting.repository';
import { MeetingController } from '@/meeting/interface/controllers/meeting.controller';
import { MeetingGateway } from '@/meeting/interface/gateways/meeting.gateway';
import { MEETING_CREATION_PORT } from '@/shared-kernel/domain/ports';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Meeting 기능을 구성하는 NestJS 모듈.
 *
 * MeetingService는 비-Nest 클래스이므로 useFactory로 묶는다.
 * 회의 영속 상태는 redis 기반 어댑터로 저장한다.
 * RedisModule(@Global)이 ioredis 클라이언트 인스턴스를 번 만들어 두고, 본 모듈의 Repository가 같은 인스턴스를 inject 한다.
 * SystemClock, NestEventBusDomainEventPublisher는 @Global()인 SharedKernelModule을 통해 주입된다.
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
        logger: PinoLogger,
      ) =>
        new MeetingService({
          repository,
          chatRepository,
          codeGenerator,
          hostTokenGenerator,
          clock,
          eventPublisher,
          logger: new PinoLoggerAdapter(logger, MeetingService.name),
        }),
      inject: [
        RedisMeetingRepository,
        RedisChatRepository,
        RandomMeetingCodeGenerator,
        RandomHostTokenGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
        PinoLogger,
      ],
    },
    {
      provide: MeetingRecoveryService,
      useFactory: (
        repository: RedisMeetingRepository,
        meetingService: MeetingService,
        clock: SystemClock,
        eventPublisher: NestEventBusDomainEventPublisher,
        logger: PinoLogger,
      ) =>
        new MeetingRecoveryService({
          repository,
          meetingService,
          clock,
          eventPublisher,
          logger: new PinoLoggerAdapter(logger, MeetingRecoveryService.name),
        }),
      inject: [
        RedisMeetingRepository,
        MeetingService,
        SystemClock,
        NestEventBusDomainEventPublisher,
        PinoLogger,
      ],
    },
    {
      provide: MeetingIdleScheduler,
      useFactory: (service: MeetingService, logger: PinoLogger) =>
        new MeetingIdleScheduler(service, new PinoLoggerAdapter(logger, MeetingIdleScheduler.name)),
      inject: [MeetingService, PinoLogger],
    },
    {
      // notion 등 다른 BC가 회의 생성을 호출하기 위한 Port. MeetingService에 위임한다.
      provide: MEETING_CREATION_PORT,
      useFactory: (service: MeetingService) => new MeetingCreationAdapter(service),
      inject: [MeetingService],
    },
  ],
  exports: [MEETING_CREATION_PORT],
})
export class MeetingModule {}
