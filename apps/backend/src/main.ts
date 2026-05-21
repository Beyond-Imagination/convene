import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { resolveCorsOrigins, resolvePort } from './config/server.config';
import { CorsIoAdapter } from './shared-kernel/infrastructure/cors-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = resolveCorsOrigins();
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useWebSocketAdapter(new CorsIoAdapter(app, corsOrigins));

  // RedisModule.onApplicationShutdown 에서 quit() 을 호출하므로 hook 활성화.
  app.enableShutdownHooks();

  await app.listen(resolvePort());
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  process.exit(1);
});
