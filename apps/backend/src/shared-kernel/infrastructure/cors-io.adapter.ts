import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

/**
 * WS gateway 전역 CORS 설정을 적용하는 IoAdapter.
 *
 * 두 Gateway(Meeting/Mediasoup)가 동일한 socket.io 서버를 공유하므로 본 adapter한 곳에서 cors 옵션을 묶는다.
 */
export class CorsIoAdapter extends IoAdapter {
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
