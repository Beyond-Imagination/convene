import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from '@/shared/api/config';

const RECONNECTION_DELAY = 300;
const RECONNECTION_DELAY_MAX = 5000;
const RANDOMIZATION_FACTOR = 0.5;

/**
 * Meeting / Mediasoup gateway가 공유하는 socket.io 클라이언트 factory.
 *
 * `API_BASE_URL`의 backend에 새 연결을 만들어 돌려준다. 회의 페이지가 mount/unmount 마다 새 socket을 만들고 닫는다.
 * `transports: ['websocket']`로 polling 단계를 건너뛰어 CORS preflight 부담을 줄이고 연결 지연을 단축한다.
 *
 * 비정상 종료(네트워크 끊김) 시 자동 재연결을 사용한다 — 일정 간격(jitter 포함)으로 backend가 살아날 때까지 무한 재시도.
 * 재연결 성공 후의 회의 재JOIN/mediasoup transport 재구축은 각 ViewModel의 `connect` 이벤트 핸들러에서 담당.
 */
export function connectMeetingSocket(): Socket {
  return io(API_BASE_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionDelayMax: RECONNECTION_DELAY_MAX,
    randomizationFactor: RANDOMIZATION_FACTOR,
    reconnectionAttempts: Infinity,
  });
}
