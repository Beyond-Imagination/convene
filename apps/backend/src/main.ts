import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import pino from 'pino';

import { AppModule } from './app.module';
import { assertEnvIsValid } from './config/env-validation';
import { resolveFeatureGates } from './config/feature-gates';
import { resolveCorsOrigins, resolvePort } from './config/server.config';
import { CorsIoAdapter } from './shared-kernel/infrastructure/cors-io.adapter';

async function bootstrap() {
  // AppModule import 시점에 ConfigModule.forRoot()가 .env를 process.env로 이미 올려 둔다.
  // 잘못된 설정으로 뜬 뒤 엉뚱한 요청에서 터지느니 여기서 멈춘다.
  assertEnvIsValid();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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

  app.enableShutdownHooks();

  const port = resolvePort();
  await app.listen(port);
  const logger = await app.resolve(PinoLogger);
  logger.info(
    { port, origins: corsOrigins, features: resolveFeatureGates() },
    'backend listening',
  );
}

bootstrap().catch((err) => {
  pino().fatal({ err }, 'bootstrap failed');
  process.exit(1);
});
