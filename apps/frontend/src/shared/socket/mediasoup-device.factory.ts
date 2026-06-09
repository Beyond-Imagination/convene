import type { Device } from 'mediasoup-client';

/**
 * mediasoup-client `Device`의 lazy factory.
 *
 * mediasoup-client는 무거운 의존(WebRTC API)이라 모듈 top-level import를 피하고 런타임 dynamic import로 코드 분할한다.
 * SSR 빌드 시점에 evaluate 되지 않도록 함수 호출 시 import.
 */
export async function createMediasoupDevice(): Promise<Device> {
  const mod = await import('mediasoup-client');
  return new mod.Device();
}
