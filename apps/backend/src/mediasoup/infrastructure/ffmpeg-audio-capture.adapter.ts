import { ChildProcess } from 'node:child_process';

import { Injectable } from '@nestjs/common';
import { Consumer, PlainTransport } from 'mediasoup/node/lib/types';

import { AudioCapturePort, AudioCaptureStartInput, CaptureStopReason } from '@/mediasoup/domain/ports/audio-capture.port';
import { AudioBufferRepository } from '@/recording/domain/ports/audio-buffer.repository';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

import {
  anchorChunkTime,
  buildSdp,
  ChunkAnchor,
  getFreePort,
  HEALTHY_LIFETIME_MS,
  shouldRespawnFfmpeg,
  spawnFfmpeg,
  waitForUdpPort,
} from './ffmpeg-process';
import { MediasoupRouterAdapter } from './mediasoup-router.adapter';

interface CaptureContext {
  readonly meetingCode: string;
  readonly participantId: string;
  producerId: string;
  /** 재시작 때 배선을 통째로 새로 깔므로 전부 교체된다. */
  transport: PlainTransport;
  consumer: Consumer;
  ffmpeg: ChildProcess;
  sdp: string;
  /** 현재 ffmpeg 프로세스를 띄운 시각. 즉시 죽는 상황을 판별한다. */
  spawnedAtMs: number;
  consecutiveFailures: number;
  /** 현재 run 의 시각 기준점. 재시작하면 비워 새 run 으로 앵커를 다시 잡는다. */
  anchor?: ChunkAnchor;
  /** stop/stopAll로 의도적으로 내리는 중이면 재spawn하지 않는다. */
  stopping: boolean;
  /** mute 로 잠시 놀고 있는 상태. 이 타이머가 끝나면 진짜로 내린다. */
  lingerTimer?: NodeJS.Timeout;
}

/** ffmpeg 이 포트를 잡기 전에 resume 하면 RTP 가 허공에 떨어진다. 감지 실패 시 상한. */
const RESUME_TIMEOUT_MS = 1000;
/** ffmpeg가 stdin 종료 후 자체 정리할 시간을 주고도 살아 있으면 SIGTERM. */
const SIGTERM_DELAY_MS = 2000;
/** 재시작 간격. 포트가 풀릴 시간을 주고 spawn 폭주도 막는다. */
const RESPAWN_DELAY_MS = 200;
/** mute 후 배선을 살려 두는 시간. ffmpeg 의 RTP idle 타임아웃(10초)보다 짧게 잡는다. */
const LINGER_MS = 3000;

function closeQuietly(resource: { closed: boolean; close: () => void }): void {
  try {
    if (!resource.closed) resource.close();
  } catch {
    /* swallow */
  }
}

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
    const lingering = this.contexts.get(key);
    if (lingering?.lingerTimer !== undefined) {
      await this.reattachCapture(lingering, input.producerId);
      return;
    }
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

  async stop(
    meetingCode: string,
    participantId: string,
    reason: CaptureStopReason = 'left',
  ): Promise<void> {
    const key = this.key(meetingCode, participantId);
    this.inflight.delete(key);
    const ctx = this.contexts.get(key);
    if (!ctx) return;

    if (reason === 'muted' && ctx.lingerTimer === undefined) {
      // producer 가 닫히면 consumer 도 함께 닫힌다. transport 와 ffmpeg 은 그대로 둔다.
      ctx.lingerTimer = setTimeout(() => {
        this.contexts.delete(key);
        void this.terminateContext(ctx);
      }, LINGER_MS);
      ctx.lingerTimer.unref?.();
      return;
    }

    this.contexts.delete(key);
    await this.terminateContext(ctx);
  }

  /** linger 중인 배선에 새 producer 를 붙인다. ffmpeg 과 포트가 그대로라 지연 없이 이어진다. */
  private async reattachCapture(ctx: CaptureContext, producerId: string): Promise<void> {
    clearTimeout(ctx.lingerTimer);
    ctx.lingerTimer = undefined;
    ctx.producerId = producerId;
    closeQuietly(ctx.consumer);
    try {
      const router = this.routerAdapter.getParticipantRouter(ctx.meetingCode, ctx.participantId);
      ctx.consumer = await ctx.transport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });
      this.logger.info(
        { meetingCode: ctx.meetingCode, participantId: ctx.participantId },
        'capture reattached',
      );
    } catch (err) {
      this.logger.error(
        { meetingCode: ctx.meetingCode, participantId: ctx.participantId, err },
        'capture reattach failed',
      );
      this.abandonContext(ctx);
    }
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
    const plumbing = await this.createMediaPlumbing(input);

    const ctx: CaptureContext = {
      meetingCode: input.meetingCode,
      participantId: input.participantId,
      producerId: input.producerId,
      transport: plumbing.transport,
      consumer: plumbing.consumer,
      ffmpeg: spawnFfmpeg(this.logger, input.meetingCode, input.participantId),
      sdp: plumbing.sdp,
      spawnedAtMs: Date.now(),
      consecutiveFailures: 0,
      stopping: false,
    };
    this.attachFfmpeg(ctx);
    this.scheduleResume(ctx, plumbing.port);
    return ctx;
  }

  private async createMediaPlumbing(
    input: AudioCaptureStartInput,
  ): Promise<{ transport: PlainTransport; consumer: Consumer; sdp: string; port: number }> {
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
    return {
      transport,
      consumer,
      sdp: buildSdp(port, codec.payloadType, codec.clockRate, codec.channels ?? 2),
      port,
    };
  }

  private scheduleResume(ctx: CaptureContext, port: number): void {
    const consumer = ctx.consumer;
    void waitForUdpPort(port, RESUME_TIMEOUT_MS)
      .then(async (result) => {
        if (result === 'unsupported') {
          await new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS));
        }
        if (ctx.stopping || consumer.closed) return;
        await consumer.resume();
      })
      .catch((err) =>
        this.logger.error(
          { meetingCode: ctx.meetingCode, participantId: ctx.participantId, err },
          'consumer resume failed',
        ),
      );
  }

  /**
   * ffmpeg 만 다시 띄우면 RTP 가 오지 않는다 — 포트가 닫힐 때 loopback 의 ICMP port
   * unreachable 이 mediasoup 의 송신 소켓을 망가뜨린다. 배선을 통째로 새로 깐다.
   */
  private async restartCapture(ctx: CaptureContext): Promise<void> {
    if (ctx.stopping) return;
    closeQuietly(ctx.consumer);
    closeQuietly(ctx.transport);

    const plumbing = await this.createMediaPlumbing({
      meetingCode: ctx.meetingCode,
      participantId: ctx.participantId,
      producerId: ctx.producerId,
    });
    if (ctx.stopping) {
      closeQuietly(plumbing.consumer);
      closeQuietly(plumbing.transport);
      return;
    }

    ctx.transport = plumbing.transport;
    ctx.consumer = plumbing.consumer;
    ctx.sdp = plumbing.sdp;
    ctx.ffmpeg = spawnFfmpeg(this.logger, ctx.meetingCode, ctx.participantId);
    ctx.spawnedAtMs = Date.now();
    ctx.anchor = undefined;
    this.attachFfmpeg(ctx);
    this.scheduleResume(ctx, plumbing.port);
  }

  /**
   * 지우지 않으면 start()의 dedup 이 죽은 context 를 살아 있다고 보고 새 produce 를 무시한다
   * — 마이크를 다시 켜도 캡처가 복구되지 않는다.
   */
  private abandonContext(ctx: CaptureContext): void {
    const key = this.key(ctx.meetingCode, ctx.participantId);
    if (this.contexts.get(key) === ctx) this.contexts.delete(key);
    ctx.stopping = true;
    closeQuietly(ctx.consumer);
    closeQuietly(ctx.transport);
  }

  private attachFfmpeg(ctx: CaptureContext): void {
    const { ffmpeg, meetingCode, participantId } = ctx;
    if (!ffmpeg.stdin || !ffmpeg.stdout) {
      throw new Error('ffmpeg stdin/stdout pipe missing');
    }
    ffmpeg.stdin.write(ctx.sdp);
    ffmpeg.stdin.end();

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      void this.appendChunk(ctx, chunk);
    });

    ffmpeg.on('close', () => {
      if (ctx.stopping) return;
      const lifetimeMs = Date.now() - ctx.spawnedAtMs;
      ctx.consecutiveFailures = lifetimeMs < HEALTHY_LIFETIME_MS ? ctx.consecutiveFailures + 1 : 0;
      if (!shouldRespawnFfmpeg({ consecutiveFailures: ctx.consecutiveFailures, lifetimeMs })) {
        this.logger.error(
          { meetingCode, participantId, lifetimeMs, failures: ctx.consecutiveFailures },
          'capture restart abandoned',
        );
        this.abandonContext(ctx);
        return;
      }
      // RTP가 10초 끊기면 ffmpeg이 Connection timed out으로 죽는다(컴파일 타임 상수라
      // 옵션으로 못 늘린다). 참가자가 잠시 침묵한 정상 상황이므로 되살린다.
      setTimeout(() => {
        this.logger.info({ meetingCode, participantId, lifetimeMs }, 'capture restart');
        this.restartCapture(ctx).catch((err) => {
          // 재생성 자체가 실패했다 — producer가 이미 닫혔거나(mute) router가 정리된 뒤일 수 있다.
          // context를 남겨 두면 다시 produce 될 때 start()가 dedup에 걸려 캡처가 영영 안 살아난다.
          this.logger.error({ meetingCode, participantId, err }, 'capture restart failed');
          this.abandonContext(ctx);
        });
      }, RESPAWN_DELAY_MS);
    });
  }

  private async appendChunk(ctx: CaptureContext, chunk: Buffer): Promise<void> {
    const { startedAtMs, anchor } = anchorChunkTime({
      anchor: ctx.anchor,
      arrivalMs: Date.now(),
      chunkBytes: chunk.length,
    });
    ctx.anchor = anchor;
    try {
      await this.audioBufferRepository.append(
        ctx.meetingCode,
        ctx.participantId,
        chunk,
        startedAtMs,
      );
    } catch (err) {
      this.logger.error(
        { meetingCode: ctx.meetingCode, participantId: ctx.participantId, err },
        'audio buffer append failed',
      );
    }
  }

  private async terminateContext(ctx: CaptureContext): Promise<void> {
    clearTimeout(ctx.lingerTimer);
    ctx.lingerTimer = undefined;
    // close 핸들러가 이걸 보고 재spawn을 건너뛴다 — 의도적 종료와 idle 타임아웃을 가른다.
    ctx.stopping = true;
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
    closeQuietly(ctx.consumer);
    closeQuietly(ctx.transport);
  }

  private key(meetingCode: string, participantId: string): string {
    return `${meetingCode}:${participantId}`;
  }
}
