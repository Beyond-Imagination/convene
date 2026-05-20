import * as os from 'os';

import { RtpCodecCapability, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';

/**
 * Mediasoup infrastructure 설정. env 변수로 prod/local/test 가 모두 조정 가능.
 *
 * - `MEDIASOUP_WORKER_NUM`: 정수 (worker 수). `auto` 면 `os.cpus().length`.
 * - `MEDIASOUP_ROUTERS_PER_ROOM`: 한 회의에 묶을 router 수 (default 2).
 * - `RTC_MIN_PORT` / `RTC_MAX_PORT`: WebRTC UDP/TCP 포트 범위.
 * - `ANNOUNCED_IP`: 클라이언트에게 알릴 공인 IP. 로컬은 127.0.0.1.
 * - `ENABLE_UDP` / `ENABLE_TCP` / `PREFER_UDP`: WebRTC transport 옵션.
 */

const parseIntEnv = (name: string, fallback: number): number => {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const parseBoolEnv = (name: string, fallback: boolean): boolean => {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v !== 'false';
};

const numWorkers = (): number => {
  const v = process.env.MEDIASOUP_WORKER_NUM;
  if (!v) return 1;
  if (v === 'auto') return os.cpus().length;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export const mediasoupConfig = {
  numWorkers: numWorkers(),

  // v1 은 소수 참가자(≤10) 회의가 대상이라 회의 1개당 router 1개로 단순화.
  // routersPerRoom > 1 로 두면 mediasoup transport 가 자기 router 의 producer 만
  // consume 가능하므로 별도 pipeToRouter 구현이 필요(plum multi-router-manager 참조).
  // 그게 미구현인 상태에서 라우터를 여러 개 두면 다른 router 에 있는 producer 를
  // consume 할 때 "Producer not found" 가 발생. 큰 회의 대응은 추후 도입.
  routersPerRoom: parseIntEnv('MEDIASOUP_ROUTERS_PER_ROOM', 1),

  worker: {
    rtcMinPort: parseIntEnv('RTC_MIN_PORT', 40000),
    rtcMaxPort: parseIntEnv('RTC_MAX_PORT', 49999),
    logLevel: (process.env.MEDIASOUP_LOG_LEVEL ?? 'warn') as WorkerLogLevel,
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'] as WorkerLogTag[],
  },

  router: {
    mediaCodecs: [
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: { 'x-google-start-bitrate': 1000 },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ] as RtpCodecCapability[],
  },

  webRtcTransport: {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP ?? '127.0.0.1' },
    ],
    enableUdp: parseBoolEnv('ENABLE_UDP', true),
    enableTcp: parseBoolEnv('ENABLE_TCP', true),
    preferUdp: parseBoolEnv('PREFER_UDP', true),
    initialAvailableOutgoingBitrate: 1_000_000,
  },
};

export type MediasoupConfig = typeof mediasoupConfig;
