import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '@/shared/api/config';

/**
 * Meeting / Mediasoup gateway 가 공유하는 socket.io 클라이언트 factory.
 *
 * `API_BASE_URL` 의 backend 에 새 연결을 만들어 돌려준다. 회의 페이지가 mount/
 * unmount 마다 새 socket 을 만들고 닫는다 — 싱글톤이 아니다(forceNew).
 *
 * `transports: ['websocket']` 로 polling 단계를 건너뛰어 CORS preflight 부담을
 * 줄이고 연결 지연을 단축한다(backend 가 폴링도 허용하므로 폴백은 가능하지만
 * frontend 디폴트는 ws-only 로 둔다).
 */
export function connectMeetingSocket(): Socket {
  return io(API_BASE_URL, {
    transports: ['websocket'],
    forceNew: true,
  });
}
