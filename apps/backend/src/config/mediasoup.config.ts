import { RtpCodecCapability, WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/types';
import * as os from 'os';

import { requireInProduction } from './required-env';

/**
 * Mediasoup infrastructure 설정.
 *
 * - `MEDIASOUP_WORKER_NUM`: 정수 (worker 수). `auto` 면 `os.cpus().length`.
 * - `MEDIASOUP_ROUTERS_PER_ROOM`: 한 회의에 묶을 router 수 (default = workers 수).
 * - `RTC_MIN_PORT` / `RTC_MAX_PORT`: WebRTC UDP/TCP 포트 범위.
 * - `ANNOUNCED_IP`: 클라이언트에게 알릴 공인 IP. 로컬은 127.0.0.1.
 * - `ENABLE_UDP` / `ENABLE_TCP` / `PREFER_UDP`: WebRTC transport 옵션.
 */

const DEFAULT_NUM_WORKERS = 1;
const DEFAULT_PARTICIPANTS_PER_ROUTER = 5;
const DEFAULT_RTC_MIN_PORT = 40000;
const DEFAULT_RTC_MAX_PORT = 49999;
const DEFAULT_LOG_LEVEL: WorkerLogLevel = 'warn';
const DEFAULT_ANNOUNCED_IP = '127.0.0.1';
const DEFAULT_OUTGOING_BITRATE = 1_000_000;

const parseIntEnv = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const v = env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const parseBoolEnv = (env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean => {
  const v = env[name];
  if (v === undefined) return fallback;
  return v !== 'false';
};

export function resolveNumWorkers(env: NodeJS.ProcessEnv = process.env): number {
  const v = env.MEDIASOUP_WORKER_NUM;
  if (!v) return DEFAULT_NUM_WORKERS;
  if (v === 'auto') return os.cpus().length;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NUM_WORKERS;
}

export function resolveParticipantsPerRouter(env: NodeJS.ProcessEnv = process.env): number {
  const v = parseIntEnv(env, 'MEDIASOUP_PARTICIPANTS_PER_ROUTER', DEFAULT_PARTICIPANTS_PER_ROUTER);
  return v > 0 ? v : DEFAULT_PARTICIPANTS_PER_ROUTER;
}

export interface WorkerOptions {
  rtcMinPort: number;
  rtcMaxPort: number;
  logLevel: WorkerLogLevel;
  logTags: WorkerLogTag[];
}

export function resolveWorkerOptions(env: NodeJS.ProcessEnv = process.env): WorkerOptions {
  return {
    rtcMinPort: parseIntEnv(env, 'RTC_MIN_PORT', DEFAULT_RTC_MIN_PORT),
    rtcMaxPort: parseIntEnv(env, 'RTC_MAX_PORT', DEFAULT_RTC_MAX_PORT),
    logLevel: (env.MEDIASOUP_LOG_LEVEL ?? DEFAULT_LOG_LEVEL) as WorkerLogLevel,
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'] as WorkerLogTag[],
  };
}

/**
 * mediasoup router의 mediaCodecs — env 의존성이 없는 상수.
 */
export const MEDIA_CODECS = [
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
] as RtpCodecCapability[];

export interface WebRtcTransportOptions {
  listenIps: Array<{ ip: string; announcedIp: string }>;
  enableUdp: boolean;
  enableTcp: boolean;
  preferUdp: boolean;
  initialAvailableOutgoingBitrate: number;
}

export function resolveWebRtcTransportOptions(
  env: NodeJS.ProcessEnv = process.env,
): WebRtcTransportOptions {
  return {
    // 운영에서 127.0.0.1 로 폴백하면 시그널링은 성공하고 미디어만 조용히 안 붙는다.
    listenIps: [
      { ip: '0.0.0.0', announcedIp: requireInProduction(env, 'ANNOUNCED_IP', DEFAULT_ANNOUNCED_IP) },
    ],
    enableUdp: parseBoolEnv(env, 'ENABLE_UDP', true),
    enableTcp: parseBoolEnv(env, 'ENABLE_TCP', true),
    preferUdp: parseBoolEnv(env, 'PREFER_UDP', true),
    initialAvailableOutgoingBitrate: DEFAULT_OUTGOING_BITRATE,
  };
}
