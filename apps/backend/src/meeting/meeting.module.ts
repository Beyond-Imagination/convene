import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingIdleScheduler } from '@/meeting/application/meeting-idle.scheduler';
import { MeetingRecoveryService } from '@/meeting/application/meeting-recovery.service';
import { CHAT_REPOSITORY } from '@/meeting/domain/ports/chat.repository';
import { HOST_TOKEN_GENERATOR } from '@/meeting/domain/ports/host-token.generator';
import { MEETING_REPOSITORY } from '@/meeting/domain/ports/meeting.repository';
import { CachedMeetingRepository } from '@/meeting/infrastructure/cached-meeting.repository';
import { MongoMeetingRepository } from '@/meeting/infrastructure/mongo-meeting.repository';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { RedisChatRepository } from '@/meeting/infrastructure/redis-chat.repository';
import { RedisMeetingRepository } from '@/meeting/infrastructure/redis-meeting.repository';
import { MeetingController } from '@/meeting/interface/controllers/meeting.controller';
import { MeetingGateway } from '@/meeting/interface/gateways/meeting.gateway';
import { MEETING_CREATION_PORT } from '@/shared-kernel/domain/ports/meeting-creation.port';

/**
 * Meeting 기능을 구성하는 NestJS 모듈.
 *
 * 회의 원본은 MongoDB, redis는 캐시다. `CachedMeetingRepository`가 둘을 묶어 MEETING_REPOSITORY로 노출된다.
 * RedisModule(@Global)이 ioredis 클라이언트를 한 번 만들어 두고, 본 모듈의 Repository가 같은 인스턴스를 inject 한다.
 * CLOCK / EVENT_PUBLISHER / LOGGER는 @Global()인 SharedKernelModule을 통해 주입된다.
 */
@Module({
  controllers: [MeetingController],
  providers: [
    MeetingService,
    MeetingRecoveryService,
    MeetingIdleScheduler,
    MeetingGateway,
    RedisMeetingRepository,
    MongoMeetingRepository,
    CachedMeetingRepository,
    { provide: MEETING_REPOSITORY, useExisting: CachedMeetingRepository },
    { provide: CHAT_REPOSITORY, useClass: RedisChatRepository },
    RandomMeetingCodeGenerator,
    { provide: HOST_TOKEN_GENERATOR, useValue: { next: () => randomUUID() } },
    { provide: MEETING_CREATION_PORT, useExisting: MeetingService },
  ],
  exports: [MEETING_CREATION_PORT],
})
export class MeetingModule {}
