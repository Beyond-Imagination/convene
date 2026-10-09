import type { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';
import { stub } from '@/shared-kernel/testing/stub';

export const noopLogger = (): PinoLoggerAdapter =>
  stub<PinoLoggerAdapter>({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });
