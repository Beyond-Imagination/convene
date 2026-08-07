import { ChildProcess } from 'node:child_process';

import { Injectable } from '@nestjs/common';
import { Consumer, PlainTransport } from 'mediasoup/node/lib/types';

import { AudioCapturePort, AudioCaptureStartInput } from '@/mediasoup/domain/ports/audio-capture.port';
import { AudioBufferRepository } from '@/recording/domain/ports/audio-buffer.repository';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

import { buildSdp, getFreePort, spawnFfmpeg } from './ffmpeg-process';
import { MediasoupRouterAdapter } from './mediasoup-router.adapter';

interface CaptureContext {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly transport: PlainTransport;
  readonly consumer: Consumer;
  readonly ffmpeg: ChildProcess;
}

/** PlainTransport.connect 직후 즉시 consumer.
 * resume하면 ffmpeg의 port binding이 끝나기 전에 RTP가 떨어져 packet loss. 1초 양보.
 * */
const RESUME_DELAY_MS = 1000;
/** ffmpeg가 stdin 종료 후 자체 정리할 시간을 주고도 살아 있으면 SIGTERM. */
const SIGTERM_DELAY_MS = 2000;

/**
 * `AudioCapturePort`의 mediasoup PlainTransport + ffmpeg 어댑터
 *
 * 한 (meetingCode, participantId) 마다 PlainTransport 1개 + ffmpeg subprocess 1개를 띄운다.
 * mediasoup가 PlainTransport를 통해 audio RTP를 127.0.0.1:{freePort}로 흘려보내고, ffmpeg가 그 port에서 SDP로 RTP를 받아 stdout으로 wav stream을 출력한다.
 * ffmpeg stdout의 chunk는 redis에 누적되고, 회의 종료 시 RecordingService가 consume해 ai-worker로 한 번에 전송한다.
 * dedup: 같은 (code, pid)에 대해 start가 중복 호출되어도 첫 호출만 효과가 있다 — in-flight Set + 완료 Map 양쪽으로 race 차단.
 */
@Injectable()
export class FfmpegAudioCaptureAdapter implements AudioCapturePort {
  private readonly contexts = new Map<string, CaptureContext>();
  private readonly inflight = new Set<string>();

  constructor(
    private readonly routerAdapter: MediasoupRouterAdapter,
    private readonly audioBufferRepository: AudioBufferRepository,
    private readonly logger: PinoLoggerAdapter,
  ) {}

  async start(input: AudioCaptureStartInput): Promise<void> {
    const key = this.key(input.meetingCode, input.participantId);
    if (this.contexts.has(key) || this.inflight.has(key)) {
      this.logger.debug(
        { meetingCode: input.meetingCode, participantId: input.participantId },
        'capture dedup',
      );
      return;
    }
    this.inflight.add(key);
    try {
      const ctx = await this.createCaptureContext(input);
      // start가 in-flight인 사이 stop이 호출돼 inflight에서 제거됐다면, 막 만든 context도 즉시 정리하고 등록하지 않는다.
      if (!this.inflight.has(key)) {
        await this.terminateContext(ctx);
        return;
      }
      this.contexts.set(key, ctx);
      this.logger.info(
        {
          meetingCode: input.meetingCode,
          participantId: input.participantId,
          producerId: input.producerId,
        },
        'capture started',
      );
    } catch (err) {
      this.logger.error(
        { meetingCode: input.meetingCode, participantId: input.participantId, err },
        'capture start failed',
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

  private async createCaptureContext(input: AudioCaptureStartInput): Promise<CaptureContext> {
    const router = this.routerAdapter.getParticipantRouter(input.meetingCode, input.participantId);

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
    const sdp = buildSdp(port, codec.payloadType, codec.clockRate, codec.channels ?? 2);

    const ffmpeg = spawnFfmpeg(this.logger, input.meetingCode, input.participantId);
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
            { meetingCode: input.meetingCode, participantId: input.participantId, err },
            'audio buffer append failed',
          ),
        );
    });

    setTimeout(() => {
      consumer
        .resume()
        .catch((err) =>
          this.logger.error(
            { meetingCode: input.meetingCode, participantId: input.participantId, err },
            'consumer resume failed',
          ),
        );
    }, RESUME_DELAY_MS);

    // 참가자의 capture 시작 시각을 1회만 기록한다. RecordingService가 회의 시작 시각을 origin으로 잡고 본 값과의 차이를
    // segment.startMs/endMs에 가산해 시간축을 회의 기준으로 normalize. SETNX 성격이라 두 번째 capture가 들어와도 첫 호출 값만 유효.
    this.audioBufferRepository
      .markStarted(input.meetingCode, input.participantId, Date.now())
      .catch((err) =>
        this.logger.error(
          { meetingCode: input.meetingCode, participantId: input.participantId, err },
          'markStarted failed',
        ),
      );

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

  private key(meetingCode: string, participantId: string): string {
    return `${meetingCode}:${participantId}`;
  }
}
