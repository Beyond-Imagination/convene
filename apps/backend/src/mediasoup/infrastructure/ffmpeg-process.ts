import { ChildProcess, spawn } from 'node:child_process';
import { AddressInfo, createServer } from 'node:net';

import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';

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
    // 노이즈 게이트.
    '-af',
    'agate=threshold=-45dB:range=0.01:release=1000',
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
