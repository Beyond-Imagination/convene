import { ChildProcess, spawn } from 'node:child_process';
import { AddressInfo, createServer } from 'node:net';

import { Injectable, Logger } from '@nestjs/common';
import { Consumer, PlainTransport } from 'mediasoup/node/lib/types';

import {
  AudioCapturePort,
  AudioCaptureStartInput,
} from '@/mediasoup/domain/ports';
import { AudioBufferRepository } from '@/recording/domain/ports';

import { MediasoupRouterAdapter } from './mediasoup-router.adapter';

interface CaptureContext {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly transport: PlainTransport;
  readonly consumer: Consumer;
  readonly ffmpeg: ChildProcess;
}

const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
/** plum 동등 — PlainTransport.connect 직후 즉시 consumer.resume 하면 ffmpeg 의
 *  port binding 이 끝나기 전에 RTP 가 떨어져 packet loss. 1초 양보. */
const RESUME_DELAY_MS = 1000;
/** ffmpeg 가 stdin 종료 후 자체 정리할 시간을 주고도 살아 있으면 SIGTERM. */
const SIGTERM_DELAY_MS = 2000;

/**
 * `AudioCapturePort` 의 mediasoup PlainTransport + ffmpeg 어댑터.
 *
 * 한 (meetingCode, participantId) 마다 PlainTransport 1 개 + ffmpeg subprocess 1
 * 개를 띄운다 (plum 패턴). mediasoup 가 PlainTransport 를 통해 audio RTP 를
 * 127.0.0.1:{freePort} 로 흘려보내고, ffmpeg 가 그 port 에서 SDP 로 RTP 를 받아
 * **stdout 으로 wav stream** 을 출력한다(디스크 미사용, PLAN.md §3 원칙).
 *
 * ffmpeg stdout 의 chunk 는 `AudioBufferRepository.append(meetingCode, pid, chunk)`
 * 로 redis 에 누적되고, 회의 종료 시 RecordingService 가 consume 해 ai-worker 로
 * 한 번에 전송한다.
 *
 * dedup: 같은 (code, pid) 에 대해 start 가 중복 호출되어도 첫 호출만 효과가
 * 있다 — in-flight Set + 완료 Map 양쪽으로 race 차단([[feedback-mediasoup-no-race]]).
 * stop 은 idempotent, stopAll 은 회의 전체 정리.
 */
@Injectable()
export class FfmpegAudioCaptureAdapter implements AudioCapturePort {
  private readonly logger = new Logger(FfmpegAudioCaptureAdapter.name);

  private readonly contexts = new Map<string, CaptureContext>();
  private readonly inflight = new Set<string>();

  constructor(
    private readonly routerAdapter: MediasoupRouterAdapter,
    private readonly audioBufferRepository: AudioBufferRepository,
  ) {}

  async start(input: AudioCaptureStartInput): Promise<void> {
    const key = this.key(input.meetingCode, input.participantId);
    if (this.contexts.has(key) || this.inflight.has(key)) {
      this.logger.debug(`capture dedup (${key})`);
      return;
    }
    this.inflight.add(key);
    try {
      const ctx = await this.createCaptureContext(input);
      // start 가 in-flight 인 사이 stop 이 호출돼 inflight 에서 제거됐다면,
      // 막 만든 context 도 즉시 정리하고 등록하지 않는다.
      if (!this.inflight.has(key)) {
        await this.terminateContext(ctx);
        return;
      }
      this.contexts.set(key, ctx);
      this.logger.log(
        `capture started (code=${input.meetingCode}, pid=${input.participantId}, producerId=${input.producerId})`,
      );
    } catch (err) {
      this.logger.error(
        `capture start failed (${key}): ${(err as Error).message}`,
      );
    } finally {
      this.inflight.delete(key);
    }
  }

  async stop(meetingCode: string, participantId: string): Promise<void> {
    const key = this.key(meetingCode, participantId);
    this.inflight.delete(key);
    const ctx = this.contexts.get(key);
    if (!ctx) return;
    this.contexts.delete(key);
    await this.terminateContext(ctx);
  }

  async stopAll(meetingCode: string): Promise<void> {
    const prefix = `${meetingCode}:`;
    for (const k of Array.from(this.inflight)) {
      if (k.startsWith(prefix)) this.inflight.delete(k);
    }
    const targets: CaptureContext[] = [];
    for (const [k, ctx] of this.contexts) {
      if (k.startsWith(prefix)) {
        this.contexts.delete(k);
        targets.push(ctx);
      }
    }
    await Promise.all(targets.map((ctx) => this.terminateContext(ctx)));
  }

  private async createCaptureContext(
    input: AudioCaptureStartInput,
  ): Promise<CaptureContext> {
    const router = this.routerAdapter.getParticipantRouter(
      input.meetingCode,
      input.participantId,
    );

    const transport = await router.createPlainTransport({
      listenIp: { ip: '127.0.0.1' },
      rtcpMux: true,
      comedia: false,
    });
    const port = await getFreePort();
    await transport.connect({ ip: '127.0.0.1', port });

    const consumer = await transport.consume({
      producerId: input.producerId,
      rtpCapabilities: router.rtpCapabilities,
      paused: true,
    });

    const codec = consumer.rtpParameters.codecs[0];
    const sdp = buildSdp(
      port,
      codec.payloadType,
      codec.clockRate,
      codec.channels ?? 2,
    );

    const ffmpeg = this.spawnFfmpeg(input.meetingCode, input.participantId);
    if (!ffmpeg.stdin || !ffmpeg.stdout) {
      throw new Error('ffmpeg stdin/stdout pipe missing');
    }
    ffmpeg.stdin.write(sdp);
    ffmpeg.stdin.end();

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      this.audioBufferRepository
        .append(input.meetingCode, input.participantId, chunk)
        .catch((err) =>
          this.logger.error(
            `audio buffer append failed (code=${input.meetingCode}, pid=${input.participantId}): ${(err as Error).message}`,
          ),
        );
    });

    setTimeout(() => {
      consumer
        .resume()
        .catch((err) =>
          this.logger.error(
            `consumer.resume failed (${input.meetingCode}/${input.participantId}): ${(err as Error).message}`,
          ),
        );
    }, RESUME_DELAY_MS);

    return {
      meetingCode: input.meetingCode,
      participantId: input.participantId,
      transport,
      consumer,
      ffmpeg,
    };
  }

  private async terminateContext(ctx: CaptureContext): Promise<void> {
    if (ctx.ffmpeg.stdin && !ctx.ffmpeg.stdin.destroyed) {
      try {
        ctx.ffmpeg.stdin.end();
      } catch {
        /* shutdown 단계라 swallow */
      }
    }
    setTimeout(() => {
      if (!ctx.ffmpeg.killed) {
        try {
          ctx.ffmpeg.kill('SIGTERM');
        } catch {
          /* swallow */
        }
      }
    }, SIGTERM_DELAY_MS);
    try {
      if (!ctx.consumer.closed) ctx.consumer.close();
    } catch {
      /* swallow */
    }
    try {
      if (!ctx.transport.closed) ctx.transport.close();
    } catch {
      /* swallow */
    }
  }

  private spawnFfmpeg(meetingCode: string, participantId: string): ChildProcess {
    const ffmpeg = spawn(FFMPEG_BIN, [
      '-loglevel', 'warning',
      '-protocol_whitelist', 'rtp,file,udp,pipe',
      '-reorder_queue_size', '100',
      '-f', 'sdp',
      '-i', 'pipe:0',
      '-analyzeduration', '0',
      '-probesize', '32',
      // 노이즈 게이트 — plum 동일.
      '-af', 'agate=threshold=-45dB:range=0.01:release=1000',
      '-map', '0:a',
      '-acodec', 'pcm_s16le',
      // AI STT 표준: 16kHz mono.
      '-ac', '1',
      '-ar', '16000',
      '-flush_packets', '1',
      // wav 컨테이너로 stdout 출력. RIFF length 는 unknown 으로 기록되지만
      // ffmpeg/faster-whisper 디코더는 stream 끝까지 읽는다.
      '-f', 'wav',
      'pipe:1',
    ]);
    ffmpeg.on('error', (err) => {
      this.logger.error(
        `ffmpeg spawn error (code=${meetingCode}, pid=${participantId}): ${err.message}`,
      );
    });
    ffmpeg.on('close', (exit) => {
      this.logger.log(
        `ffmpeg closed (code=${meetingCode}, pid=${participantId}, exit=${exit})`,
      );
    });
    if (ffmpeg.stderr) {
      ffmpeg.stderr.on('data', (data: Buffer) => {
        this.logger.debug(
          `[ffmpeg ${meetingCode}/${participantId}] ${data.toString().trim()}`,
        );
      });
    }
    return ffmpeg;
  }

  private key(meetingCode: string, participantId: string): string {
    return `${meetingCode}:${participantId}`;
  }
}

function buildSdp(
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

function getFreePort(): Promise<number> {
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
