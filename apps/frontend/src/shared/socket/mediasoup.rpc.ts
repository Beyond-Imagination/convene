import type { Socket } from 'socket.io-client';

/**
 * mediasoup signaling RPC 타임아웃.
 * backend handler가 throw 하면 NestJS WS가 ACK callback을 호출하지 않아 socket.io의 emitWithAck가 영원히 대기한다.
 * (transport.connect → 'connect' callback 미호출 → produce 영원 대기)
 * 명시 timeout으로 무한 hang 회피 + mediasoup-client transport의 errback 트리거.
 */
const RPC_TIMEOUT_MS = 10_000;

export const rpcWithTimeout = async <T>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`mediasoup RPC '${event}' timeout after ${RPC_TIMEOUT_MS}ms`)),
      RPC_TIMEOUT_MS,
    );
    socket.emitWithAck(event, payload).then(
      (res) => {
        clearTimeout(timer);
        resolve(res as T);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
};
