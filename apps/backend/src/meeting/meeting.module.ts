import { Module } from '@nestjs/common';

import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingIdleScheduler } from '@/meeting/application/meeting-idle.scheduler';
import { MeetingRecoveryService } from '@/meeting/application/meeting-recovery.service';
import { CHAT_REPOSITORY } from '@/meeting/domain/ports/chat.repository';
import { MEETING_REPOSITORY } from '@/meeting/domain/ports/meeting.repository';
import { CachedMeetingRepository } from '@/meeting/infrastructure/cached-meeting.repository';
import { MongoMeetingRepository } from '@/meeting/infrastructure/mongo-meeting.repository';
import { RandomMeetingCodeGenerator } from '@/meeting/infrastructure/random-meeting-code.generator';
import { RedisChatRepository } from '@/meeting/infrastructure/redis-chat.repository';
import { RedisMeetingRepository } from '@/meeting/infrastructure/redis-meeting.repository';
import { MeetingController } from '@/meeting/interface/meeting.controller';
import { MeetingGateway } from '@/meeting/interface/meeting.gateway';

/** 회의 원본은 MongoDB, redis는 캐시다. `CachedMeetingRepository`가 둘을 묶어 노출한다. */
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
  ],
  // notion BC가 회의 생성을 호출한다.
  exports: [MeetingService],
})
export class MeetingModule {}
