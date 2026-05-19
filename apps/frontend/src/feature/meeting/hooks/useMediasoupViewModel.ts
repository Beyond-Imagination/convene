'use client';

import type { Socket } from 'socket.io-client';

/**
 * Mediasoup 클라이언트 ViewModel — spec 단계 stub.
 *
 * 실제 구현(getRtpCapabilities → device.load → createTransport send/recv,
 * connect 이벤트 → connectTransport RPC 위임, unmount cleanup) 은
 * 후속 커밋에서 채운다.
 */

export type MediasoupConnectionStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface UseMediasoupViewModel {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
}

export function useMediasoupViewModel(
  _socket: Socket | null,
  _code: string,
): UseMediasoupViewModel {
  throw new Error('not implemented');
}
