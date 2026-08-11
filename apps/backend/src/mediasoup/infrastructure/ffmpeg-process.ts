import { ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { AddressInfo, createServer } from 'node:net';

import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';

/** 노이즈 게이트. -45dB 는 공격적이라 작게 말하는 참가자의 어두를 삼킬 수 있다(CNV-22에서 조정 예정). */
const DEFAULT_AUDIO_FILTER = 'agate=threshold=-45dB:range=0.01:release=1000';

/**
 * STT 전처리 필터 체인. `FFMPEG_AUDIO_FILTER=none` 이면 필터 없이 raw 로 뽑는다.
 *
 * 벤치 샘플은 필터를 끈 상태로 떠내야 한다 — 그래야 후보 체인들을 같은 오디오에
 * 오프라인으로 걸어 비교할 수 있다. 필터를 거친 오디오에는 다시 걸 수 없다.
 */
function audioFilterArgs(): string[] {
  const configured = process.env.FFMPEG_AUDIO_FILTER?.trim();
  if (configured === 'none') return [];
  return ['-af', configured || DEFAULT_AUDIO_FILTER];
}

/** 16kHz mono pcm_s16le. audio-chunker 의 상수와 같은 포맷을 전제한다. */
const PCM_BYTES_PER_SECOND = 32_000;

/** 이 시간 이상 살아 있었으면 정상 동작 중 idle 타임아웃으로 죽은 것으로 본다. */
export const HEALTHY_LIFETIME_MS = 5_000;
/** 즉시 죽는 상황에서 허용할 연속 재시도 횟수. */
const MAX_IMMEDIATE_FAILURES = 3;
/** 포트 바인딩 확인 간격. */
const PORT_POLL_INTERVAL_MS = 20;
const RUN_DRIFT_TOLERANCE_MS = 1_000;

export interface RespawnDecisionInput {
  readonly consecutiveFailures: number;
  /** 방금 죽은 ffmpeg 프로세스가 살아 있던 시간(ms). */
  readonly lifetimeMs: number;
}

/** PCM byte 수를 재생 길이(ms)로 환산한다. chunk 도착 시각에서 빼면 첫 sample 의 시각이 된다. */
export function pcmDurationMs(bytes: number): number {
  return Math.floor((bytes / PCM_BYTES_PER_SECOND) * 1000);
}

export interface ChunkAnchor {
  /** 현재 run 첫 sample 의 절대 시각(epoch ms). */
  readonly startedAtMs: number;
  /** 그 시각 이후 이 run 에서 흘려보낸 PCM 누적량. */
  readonly bytes: number;
}

export interface AnchorChunkTimeInput {
  readonly anchor: ChunkAnchor | undefined;
  readonly arrivalMs: number;
  readonly chunkBytes: number;
}

/**
 * 도착 시각을 그대로 쓰면 이벤트 루프 지터가 시각에 실려 연속 오디오가 잘게 쪼개진다.
 * 크게 늦어지면 실제로 오디오가 빈 것이므로 앵커를 다시 잡는다.
 */
export function anchorChunkTime(input: AnchorChunkTimeInput): {
  startedAtMs: number;
  anchor: ChunkAnchor;
} {
  const arrivalStartMs = input.arrivalMs - pcmDurationMs(input.chunkBytes);
  const expectedMs =
    input.anchor === undefined
      ? arrivalStartMs
      : input.anchor.startedAtMs + pcmDurationMs(input.anchor.bytes);

  if (input.anchor === undefined || arrivalStartMs - expectedMs > RUN_DRIFT_TOLERANCE_MS) {
    return {
      startedAtMs: arrivalStartMs,
      anchor: { startedAtMs: arrivalStartMs, bytes: input.chunkBytes },
    };
  }
  return {
    startedAtMs: expectedMs,
    anchor: {
      startedAtMs: input.anchor.startedAtMs,
      bytes: input.anchor.bytes + input.chunkBytes,
    },
  };
}

/** 직접 bind 로 확인하면 ffmpeg 의 bind 를 뺏을 수 있어, 읽기만으로 판별한다. */
export function isUdpPortBound(procNetUdp: string, port: number): boolean {
  const wanted = port.toString(16).toUpperCase().padStart(4, '0');
  return procNetUdp
    .split('\n')
    .slice(1)
    .some((line) => {
      const local = line.trim().split(/\s+/)[1];
      return local !== undefined && local.split(':')[1] === wanted;
    });
}

/**
 * 죽은 ffmpeg 을 다시 띄울지.
 *
 * RTP 가 10초 끊기면 ffmpeg 이 `Connection timed out` 으로 종료하는데, 이는 참가자가
 * 잠시 말을 멈춘 정상 상황이므로 되살려야 한다. 다만 spawn 직후 즉시 죽는 상황이
 * 반복되면(바이너리 부재·포트 점유 등) 무한 루프가 되므로 그때는 포기한다.
 */
export function shouldRespawnFfmpeg(input: RespawnDecisionInput): boolean {
  if (input.lifetimeMs >= HEALTHY_LIFETIME_MS) return true;
  return input.consecutiveFailures < MAX_IMMEDIATE_FAILURES;
}

/** `unsupported` 만 호출 측이 고정 지연으로 물러난다 — `timeout` 은 이미 그만큼 기다렸다. */
export type PortWaitResult = 'bound' | 'timeout' | 'unsupported';

/** ffmpeg 이 포트를 잡을 때까지 대기. 고정 지연으로 기다리면 마이크를 켤 때마다 그만큼 유실된다. */
export async function waitForUdpPort(port: number, timeoutMs: number): Promise<PortWaitResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let table: string;
    try {
      table = await readFile('/proc/net/udp', 'utf8');
    } catch {
      return 'unsupported';
    }
    if (isUdpPortBound(table, port)) return 'bound';
    await new Promise((resolve) => setTimeout(resolve, PORT_POLL_INTERVAL_MS));
  }
  return 'timeout';
}

/** mediasoup PlainTransport가 RTP를 흘려보낼 로컬 포트를 OS에서 하나 받아온다. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** ffmpeg에 stdin으로 먹일 SDP. mediasoup가 협상한 opus 파라미터를 그대로 옮긴다. */
export function buildSdp(
  port: number,
  payloadType: number,
  clockRate: number,
  channels: number,
): string {
  return (
    `v=0\n` +
    `o=- 0 0 IN IP4 127.0.0.1\n` +
    `s=mediasoup\n` +
    `c=IN IP4 127.0.0.1\n` +
    `t=0 0\n` +
    `m=audio ${port} RTP/AVP ${payloadType}\n` +
    `a=rtpmap:${payloadType} opus/${clockRate}/${channels}\n` +
    `a=fmtp:${payloadType} sprop-stereo=1\n`
  );
}

/**
 * SDP(stdin) → raw PCM(stdout) 변환용 ffmpeg 프로세스를 띄운다.
 * STT 품질 튜닝(노이즈 게이트, 샘플레이트)은 여기 인자만 손대면 된다.
 */
export function spawnFfmpeg(
  logger: PinoLoggerAdapter,
  meetingCode: string,
  participantId: string,
): ChildProcess {
  const ffmpeg = spawn(FFMPEG_BIN, [
    '-loglevel',
    'warning',
    '-protocol_whitelist',
    'rtp,file,udp,pipe',
    '-reorder_queue_size',
    '100',
    '-f',
    'sdp',
    '-i',
    'pipe:0',
    '-analyzeduration',
    '0',
    '-probesize',
    '32',
    ...audioFilterArgs(),
    '-map',
    '0:a',
    '-acodec',
    'pcm_s16le',
    // AI STT 표준: 16kHz mono.
    '-ac',
    '1',
    '-ar',
    '16000',
    '-flush_packets',
    '1',
    // raw PCM 출력 — wav 컨테이너보다 chunk 단위 자르기가 자유롭다(중간을 잘라도 valid).
    '-f',
    's16le',
    'pipe:1',
  ]);
  ffmpeg.on('error', (err) => {
    logger.error({ meetingCode, participantId, err }, 'ffmpeg spawn error');
  });
  ffmpeg.on('close', (exit) => {
    logger.info({ meetingCode, participantId, exit }, 'ffmpeg closed');
  });
  if (ffmpeg.stderr) {
    ffmpeg.stderr.on('data', (data: Buffer) => {
      logger.debug({ meetingCode, participantId, line: data.toString().trim() }, 'ffmpeg stderr');
    });
  }
  return ffmpeg;
}
