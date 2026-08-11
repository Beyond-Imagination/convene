import { ChildProcess } from 'node:child_process';

import { Injectable } from '@nestjs/common';
import { Consumer, PlainTransport } from 'mediasoup/node/lib/types';

import { AudioCapturePort, AudioCaptureStartInput } from '@/mediasoup/domain/ports/audio-capture.port';
import { AudioBufferRepository } from '@/recording/domain/ports/audio-buffer.repository';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

import {
  buildSdp,
  getFreePort,
  HEALTHY_LIFETIME_MS,
  shouldRespawnFfmpeg,
  silencePaddingBytes,
  spawnFfmpeg,
} from './ffmpeg-process';
import { MediasoupRouterAdapter } from './mediasoup-router.adapter';

interface CaptureContext {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly transport: PlainTransport;
  readonly consumer: Consumer;
  /** ffmpeg가 RTP idle로 죽으면 같은 포트로 다시 띄우므로 교체된다. */
  ffmpeg: ChildProcess;
  /** 재spawn 시 그대로 다시 먹일 SDP. mediasoup는 계속 같은 포트로 쏘고 있다. */
  readonly sdp: string;
  /** 캡처 시작 시각(epoch ms). 벽시계 대비 부족분을 무음으로 채우는 기준. */
  readonly startedAtMs: number;
  /** 현재 ffmpeg 프로세스를 띄운 시각. 즉시 죽는 상황을 판별한다. */
  spawnedAtMs: number;
  consecutiveFailures: number;
  writtenBytes: number;
  /** stop/stopAll로 의도적으로 내리는 중이면 재spawn하지 않는다. */
  stopping: boolean;
}

/** PlainTransport.connect 직후 즉시 consumer.
 * resume하면 ffmpeg의 port binding이 끝나기 전에 RTP가 떨어져 packet loss. 1초 양보.
 * */
const RESUME_DELAY_MS = 1000;
/** ffmpeg가 stdin 종료 후 자체 정리할 시간을 주고도 살아 있으면 SIGTERM. */
const SIGTERM_DELAY_MS = 2000;
/** 재spawn 간격. 포트가 풀릴 시간을 주고 spawn 폭주도 막는다. */
const RESPAWN_DELAY_MS = 200;

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

    const ctx: CaptureContext = {
      meetingCode: input.meetingCode,
      participantId: input.participantId,
      transport,
      consumer,
      ffmpeg: spawnFfmpeg(this.logger, input.meetingCode, input.participantId),
      sdp,
      startedAtMs: Date.now(),
      spawnedAtMs: Date.now(),
      consecutiveFailures: 0,
      writtenBytes: 0,
      stopping: false,
    };
    this.attachFfmpeg(ctx);

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
      .markStarted(input.meetingCode, input.participantId, ctx.startedAtMs)
      .catch((err) =>
        this.logger.error(
          { meetingCode: input.meetingCode, participantId: input.participantId, err },
          'markStarted failed',
        ),
      );

    return ctx;
  }

  /**
   * ffmpeg 프로세스에 stdin(SDP)·stdout(PCM)·close 핸들러를 건다.
   *
   * 재spawn 때도 그대로 다시 호출된다 — PlainTransport와 consumer는 살아 있고
   * mediasoup는 계속 같은 포트로 RTP를 쏘고 있으므로 ffmpeg만 갈아 끼우면 된다.
   */
  private attachFfmpeg(ctx: CaptureContext): void {
    const { ffmpeg, meetingCode, participantId } = ctx;
    if (!ffmpeg.stdin || !ffmpeg.stdout) {
      throw new Error('ffmpeg stdin/stdout pipe missing');
    }
    ffmpeg.stdin.write(ctx.sdp);
    ffmpeg.stdin.end();

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      void this.appendWithPadding(ctx, chunk);
    });

    ffmpeg.on('close', () => {
      if (ctx.stopping) return;
      const lifetimeMs = Date.now() - ctx.spawnedAtMs;
      ctx.consecutiveFailures = lifetimeMs < HEALTHY_LIFETIME_MS ? ctx.consecutiveFailures + 1 : 0;
      if (!shouldRespawnFfmpeg({ consecutiveFailures: ctx.consecutiveFailures, lifetimeMs })) {
        this.logger.error(
          { meetingCode, participantId, lifetimeMs, failures: ctx.consecutiveFailures },
          'ffmpeg respawn abandoned',
        );
        return;
      }
      // RTP가 10초 끊기면 ffmpeg이 Connection timed out으로 죽는다(컴파일 타임 상수라
      // 옵션으로 못 늘린다). 참가자가 잠시 침묵한 정상 상황이므로 되살린다.
      setTimeout(() => {
        if (ctx.stopping) return;
        this.logger.info({ meetingCode, participantId, lifetimeMs }, 'ffmpeg respawn');
        ctx.ffmpeg = spawnFfmpeg(this.logger, meetingCode, participantId);
        ctx.spawnedAtMs = Date.now();
        try {
          this.attachFfmpeg(ctx);
        } catch (err) {
          this.logger.error({ meetingCode, participantId, err }, 'ffmpeg respawn failed');
        }
      }, RESPAWN_DELAY_MS);
    });
  }

  /**
   * 벽시계 대비 부족한 구간을 무음으로 메운 뒤 chunk를 append 한다.
   *
   * DTX 침묵과 ffmpeg 재시작 공백 양쪽에서 출력이 비는데, 시간축이
   * `startedAtMs + 누적 byte`라 그대로 두면 이후 발화가 앞으로 밀린다.
   */
  private async appendWithPadding(ctx: CaptureContext, chunk: Buffer): Promise<void> {
    const padding = silencePaddingBytes({
      elapsedMs: Date.now() - ctx.startedAtMs,
      writtenBytes: ctx.writtenBytes,
      incomingBytes: chunk.length,
    });
    const payload = padding > 0 ? Buffer.concat([Buffer.alloc(padding), chunk]) : chunk;
    ctx.writtenBytes += payload.length;
    try {
      await this.audioBufferRepository.append(ctx.meetingCode, ctx.participantId, payload);
    } catch (err) {
      this.logger.error(
        { meetingCode: ctx.meetingCode, participantId: ctx.participantId, err },
        'audio buffer append failed',
      );
    }
  }

  private async terminateContext(ctx: CaptureContext): Promise<void> {
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
