import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AUDIO_BUFFER_REPOSITORY, AudioBufferRepository } from '@/recording/domain/ports/audio-buffer.repository';
import { AbsoluteTranscriptSegment, PARTIAL_TRANSCRIPT_STORE, PartialTranscriptStore } from '@/recording/domain/ports/partial-transcript.store';
import { TRANSCRIBER, TranscriberPort } from '@/recording/domain/ports/transcriber.port';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

import {
  isSilentPcm,
  packRunsIntoBatches,
  PCM_BYTES_PER_SECOND,
  RunBatch,
  wrapPcmAsWav,
} from '../infrastructure/audio-chunker';

/** 단어가 chunk 경계에 걸리지 않도록 매 drain 이 남기는 꼬리. 16kHz pcm_s16le 2초. */
export const KEEP_LAST_BYTES = PCM_BYTES_PER_SECOND * 2;

/**
 * drain 주기. 한 번 걷은 오디오가 배치 하나에 들어가야 하므로
 * `BATCH_SPEECH_BUDGET_MS` 를 넘지 않아야 한다 — 넘으면 그 자리에서 배치가 갈린다.
 */
export const PARTIAL_INTERVAL_MS = 30_000;

/**
 * 회의 진행 중 매 N초 누적 audio 를 ai-worker 로 보내고 결과를 partial transcript 에 누적한다.
 * 각 run 이 자기 절대 시각을 들고 오므로 segment 시각은 거기에 더하기만 하면 된다.
 *
 * 실패는 swallow + log — partial 누적은 best-effort이고, 잔여 audio는 회의 종료 시점에 어차피 다시 처리된다.
 */
@Injectable()
export class PartialTranscriptionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(AUDIO_BUFFER_REPOSITORY) private readonly audioBufferRepository: AudioBufferRepository,
    @Inject(TRANSCRIBER) private readonly transcriber: TranscriberPort,
    @Inject(PARTIAL_TRANSCRIPT_STORE) private readonly partialTranscriptStore: PartialTranscriptStore,
    private readonly logger: PinoLoggerAdapter,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error({ err }, 'partial tick failed'));
    }, PARTIAL_INTERVAL_MS);
    // Node.js가 본 timer 때문에 프로세스 종료를 막지 않도록 unref.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<void> {
    const meetings = await this.audioBufferRepository.listActiveMeetings();
    for (const code of meetings) {
      const pids = await this.audioBufferRepository.listActiveParticipants(code);
      for (const pid of pids) {
        await this.processParticipant(code, pid);
      }
    }
  }

  private async processParticipant(meetingCode: string, participantId: string): Promise<void> {
    try {
      const runs = await this.audioBufferRepository.drainAvailable(
        meetingCode,
        participantId,
        KEEP_LAST_BYTES,
      );
      // 마이크를 켠 채 말하지 않으면 무음 run 이 쌓인다. 보내 봐야 연산만 쓴다.
      const spoken = runs.filter((run) => !isSilentPcm(run.pcm));
      if (spoken.length === 0) return;
      const batches = packRunsIntoBatches(spoken);
      this.logger.debug(
        { meetingCode, participantId, runs: runs.length, batches: batches.length },
        'partial drain',
      );
      for (const batch of batches) {
        await this.transcribeBatch(meetingCode, participantId, batch);
      }
    } catch (err) {
      this.logger.error({ meetingCode, participantId, err }, 'partial transcribe failed');
    }
  }

  private async transcribeBatch(
    meetingCode: string,
    participantId: string,
    batch: RunBatch,
  ): Promise<void> {
    if (batch.pcm.length === 0) return;
    const segments = await this.transcriber.transcribe({
      meetingCode,
      participantId,
      audio: wrapPcmAsWav(batch.pcm),
    });
    // drain 끼리 겹치지 않는다 — 여기서 dedup 하면 남긴 꼬리만큼 발화가 사라진다.
    const absolute: AbsoluteTranscriptSegment[] = segments.map((s) => ({
      speaker: participantId,
      text: s.text,
      absoluteStartMs: batch.startedAtMs + s.startMs,
      absoluteEndMs: batch.startedAtMs + s.endMs,
    }));
    await this.partialTranscriptStore.append(meetingCode, absolute);
  }
}
