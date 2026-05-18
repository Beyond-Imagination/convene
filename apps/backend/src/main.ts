import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';

import { AppModule } from './app.module';

/**
 * Backend HTTP/WS 리슨 포트.
 *
 * Next.js dev 서버가 3000 을 점유하므로 backend 는 디폴트 5000 을 쓴다.
 * 운영/CI 에서는 `PORT` 환경변수로 override 한다.
 */
const DEFAULT_PORT = 5000;

/**
 * HTTP/WS 허용 origin.
 *
 * 디폴트는 Next.js dev 서버(`http://localhost:3000`). 운영에서는 CloudFront
 * 도메인을 콤마 구분으로 `CORS_ORIGIN` 환경변수에 둔다.
 */
const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

/**
 * WS gateway 전역 CORS 설정을 적용하는 IoAdapter.
 *
 * 두 Gateway(Meeting/Mediasoup) 가 동일한 socket.io 서버를 공유하므로 본 adapter
 * 한 곳에서 cors 옵션을 묶는다 ([[gateway-shared-config]]).
 */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Record<string, unknown>): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.origins,
        credentials: true,
      },
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins));

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

bootstrap();
