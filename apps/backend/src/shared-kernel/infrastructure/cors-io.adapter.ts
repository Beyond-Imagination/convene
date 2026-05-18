import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

/**
 * WS gateway 전역 CORS 설정을 적용하는 IoAdapter.
 *
 * 두 Gateway(Meeting/Mediasoup) 가 동일한 socket.io 서버를 공유하므로 본 adapter
 * 한 곳에서 cors 옵션을 묶는다 ([[gateway-shared-config]]).
 *
 * `super.createIOServer` 가 반환하는 socket.io Server 인스턴스에 cors 옵션을
 * 머지해 전달한다. 본 adapter 는 IoAdapter 외부 의존(예: ConfigService)을 두지
 * 않으며, origin 리스트는 main.ts 부트스트랩에서 결정한 값을 주입받는다.
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
