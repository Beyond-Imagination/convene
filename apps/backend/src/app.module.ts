import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { isPrettyLoggingEnabled, resolveLogLevel } from '@/config/logger.config';
import { MediasoupModule } from '@/mediasoup/mediasoup.module';
import { MeetingModule } from '@/meeting/meeting.module';
import { MongoModule } from '@/mongo/mongo.module';
import { NotionModule } from '@/notion/notion.module';
import { RecordingModule } from '@/recording/recording.module';
import { RedisModule } from '@/redis/redis.module';
import { ReportsModule } from '@/reports/reports.module';
import { DomainExceptionFilter } from '@/shared-kernel/interface/domain-exception.filter';
import { SharedKernelModule } from '@/shared-kernel/shared-kernel.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // forRootAsync: useFactory를 ConfigModule의 .env 로딩 완료 후 실행해
    // resolveLogLevel/isPrettyLoggingEnabled가 .env 값을 읽도록 한다.
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: resolveLogLevel(),
          transport: isPrettyLoggingEnabled()
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
          // 민감 헤더는 로그에서 가린다. (newrelic 등 외부로 전달되기 전에 차단)
          // set-cookie는 요청이 아니라 응답 헤더이므로 res 경로로 가린다.
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-host-token"]',
            'req.query.nickname',
            'res.headers["set-cookie"]',
          ],
          serializers: {
            // 쿼리에 닉네임이 실리는 경로가 있어 url은 경로만 남긴다.
            req: (req: { url?: string }) => ({ ...req, url: req.url?.split('?')[0] }),
          },
        },
      }),
    }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ScheduleModule.forRoot(),
    SharedKernelModule,
    RedisModule,
    MongoModule,
    MeetingModule,
    MediasoupModule,
    ReportsModule,
    RecordingModule,
    NotionModule.register(),
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
