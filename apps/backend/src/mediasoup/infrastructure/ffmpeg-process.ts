import { ChildProcess, spawn } from 'node:child_process';
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
const PCM_BYTES_PER_SAMPLE = 2;

/** 정상 jitter를 패딩하지 않도록 하는 하한(200ms 분량). */
export const PAD_THRESHOLD_BYTES = PCM_BYTES_PER_SECOND / 5;

/** 이 시간 이상 살아 있었으면 정상 동작 중 idle 타임아웃으로 죽은 것으로 본다. */
export const HEALTHY_LIFETIME_MS = 5_000;
/** 즉시 죽는 상황에서 허용할 연속 재시도 횟수. */
const MAX_IMMEDIATE_FAILURES = 3;

export interface SilencePaddingInput {
  /** 캡처 시작 이후 실제 경과 시간(ms). */
  readonly elapsedMs: number;
  /** 지금까지 버퍼에 기록한 PCM 총량(byte). */
  readonly writtenBytes: number;
  /** 이번에 기록할 chunk 크기(byte). */
  readonly incomingBytes: number;
}

export interface RespawnDecisionInput {
  readonly consecutiveFailures: number;
  /** 방금 죽은 ffmpeg 프로세스가 살아 있던 시간(ms). */
  readonly lifetimeMs: number;
}

/**
 * 벽시계 대비 부족한 PCM 을 무음으로 채울 byte 수.
 *
 * Opus DTX 로 참가자가 말을 멈추면 브라우저가 RTP 전송을 멈추고, ffmpeg 도 그동안
 * PCM 을 내보내지 않는다. 시간축은 `startedAtMs + 누적 byte` 로 계산하므로 그대로 두면
 * 침묵이 삭제된 압축 시간축이 되어 이후 발화의 타임스탬프가 앞으로 밀린다.
 */
export function silencePaddingBytes(input: SilencePaddingInput): number {
  const expectedBytes = Math.floor((input.elapsedMs / 1000) * PCM_BYTES_PER_SECOND);
  const shortfall = expectedBytes - input.writtenBytes - input.incomingBytes;
  if (shortfall < PAD_THRESHOLD_BYTES) return 0;
  // sample 경계(2 byte)로 내림 — 홀수 byte 를 끼우면 이후 전체 sample 이 어긋난다.
  return shortfall - (shortfall % PCM_BYTES_PER_SAMPLE);
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
