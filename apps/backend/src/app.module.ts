import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { MediasoupModule } from '@/mediasoup/mediasoup.module';
import { MeetingModule } from '@/meeting/meeting.module';
import { SharedKernelModule } from '@/shared-kernel/shared-kernel.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    SharedKernelModule,
    MeetingModule,
    MediasoupModule,
  ],
})
export class AppModule {}
