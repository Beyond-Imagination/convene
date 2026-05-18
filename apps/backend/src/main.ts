import 'reflect-metadata';

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

bootstrap();
