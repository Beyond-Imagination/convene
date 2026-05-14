import { Module } from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { InMemoryChatRepository } from '@/meeting/infrastructure/in-memory-chat.repository';
import { InMemoryMeetingRepository } from '@/meeting/infrastructure/in-memory-meeting.repository';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { MeetingController } from '@/meeting/interface/controllers/meeting.controller';
import { MeetingGateway } from '@/meeting/interface/gateways/meeting.gateway';

import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { SystemClock } from '@/shared-kernel/infrastructure/system.clock';

/**
 * Meeting bounded context의 NestJS 모듈.
 *
 * v1 마이그레이션 초기에는 in-memory repository를 default provider로 쓰고,
 * Redis 어댑터가 준비되는 즉시 provider 토큰만 교체한다.
 *
 * SystemClock, NestEventBusDomainEventPublisher는 @Global()인 SharedKernelModule을
 * 통해 주입된다(AppModule에서 1회 import).
 *
 * MeetingService는 비-Nest 클래스(생성자에서 deps 객체를 받음)이므로 useFactory로 묶는다.
 */
@Module({
  controllers: [MeetingController],
  providers: [
    InMemoryMeetingRepository,
    InMemoryChatRepository,
    RandomMeetingCodeGenerator,
    MeetingGateway,
    {
      provide: MeetingService,
      useFactory: (
        repository: InMemoryMeetingRepository,
        chatRepository: InMemoryChatRepository,
        codeGenerator: RandomMeetingCodeGenerator,
        clock: SystemClock,
        eventPublisher: NestEventBusDomainEventPublisher,
      ) =>
        new MeetingService({
          repository,
          chatRepository,
          codeGenerator,
          clock,
          eventPublisher,
        }),
      inject: [
        InMemoryMeetingRepository,
        InMemoryChatRepository,
        RandomMeetingCodeGenerator,
        SystemClock,
        NestEventBusDomainEventPublisher,
      ],
    },
  ],
})
export class MeetingModule {}
