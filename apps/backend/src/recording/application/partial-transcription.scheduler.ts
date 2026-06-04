import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  AbsoluteTranscriptSegment,
  AudioBufferRepository,
  PartialTranscriptStore,
  TranscriberPort,
} from '@/recording/domain/ports';

import {
  dropOverlapHeadSegments,
  PCM_BYTES_PER_SECOND,
  wrapPcmAsWav,
} from '../infrastructure/audio-chunker';

/**
 * 회의 진행 중 매 N초 마다 누적된 audio chunk 를 잘라 ai-worker 로
 * 보내고, 결과 segments 를 회의 단위 partial transcript 에 누적한다.
 *
 * - 매 `INTERVAL_MS` 마다 `audioBufferRepository.listActiveMeetings()` 으로
 *   active 회의 enumerate (meeting BC 와 결합 없는 self-contained 방식).
 * - 각 (code, pid) 마다 `drainAvailable(KEEP_LAST_BYTES)` 로 누적 PCM 을 잘라낸다.
 *   끝 `KEEP_LAST_BYTES`(2초) 는 overlap 으로 redis 에 남는다.
 * - drain pcm → wav → `transcriber.transcribe()` → segment 의 startMs/endMs 에
 *   `startedAtMs(epoch ms) + chunk.startMs(participant audio 시간축)` 가산해
 *   AbsoluteTranscriptSegment 로 변환 후 store 에 append.
 *
 * 회의 종료 시 `RecordingService.requestTranscription` 이 partial store consume +
 * 잔여 audio 처리 + meetingStartedAtMs 정규화로 회의 시간축 transcript 를 만든다.
 *
 * 실패는 swallow + log — partial 누적은 best-effort 이고, 잔여 audio 는 회의
 * 종료 시점에 어차피 다시 처리된다.
 */

export const PARTIAL_INTERVAL_MS = 30_000;
/** chunk 경계 단어 잘림 보호를 위한 overlap(byte). 16kHz pcm_s16le 2초 분량. */
export const KEEP_LAST_BYTES = PCM_BYTES_PER_SECOND * 2;

export interface PartialTranscriptionSchedulerDeps {
  audioBufferRepository: AudioBufferRepository;
  transcriber: TranscriberPort;
  partialTranscriptStore: PartialTranscriptStore;
}

@Injectable()
export class PartialTranscriptionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartialTranscriptionScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly deps: PartialTranscriptionSchedulerDeps) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error(`partial tick failed: ${(err as Error).message}`),
      );
    }, PARTIAL_INTERVAL_MS);
    // Node.js 가 본 timer 때문에 프로세스 종료를 막지 않도록 unref.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<void> {
    const meetings = await this.deps.audioBufferRepository.listActiveMeetings();
    for (const code of meetings) {
      const pids = await this.deps.audioBufferRepository.listActiveParticipants(code);
      for (const pid of pids) {
        await this.processParticipant(code, pid);
      }
    }
  }

  private async processParticipant(meetingCode: string, participantId: string): Promise<void> {
    try {
      const { pcm, startMs, startedAtMs } =
        await this.deps.audioBufferRepository.drainAvailable(
          meetingCode,
          participantId,
          KEEP_LAST_BYTES,
        );
      if (pcm.length === 0) return;
      // startedAtMs 가 아직 없으면 capture markStarted 가 늦은 경우. drain 한 PCM
      // 은 redis 에 다시 못 넣으니 origin 을 0(=epoch) 으로 두고 일단 진행한다.
      const originMs = startedAtMs ?? 0;
      const wav = wrapPcmAsWav(pcm);
      const rawSegments = await this.deps.transcriber.transcribe({
        meetingCode,
        audio: wav,
      });
      // 첫 partial(chunk.startMs === 0) 이 아니면 chunk-local startMs < overlapMs
      // 안 segments 는 이전 partial 끝과 중복 가능성 → skip.
      const segments = dropOverlapHeadSegments(rawSegments, startMs === 0);
      const absolute: AbsoluteTranscriptSegment[] = segments.map((s) => ({
        speaker: participantId,
        text: s.text,
        absoluteStartMs: originMs + startMs + s.startMs,
        absoluteEndMs: originMs + startMs + s.endMs,
      }));
      await this.deps.partialTranscriptStore.append(meetingCode, absolute);
    } catch (err) {
      this.logger.error(
        `partial transcribe failed (code=${meetingCode}, pid=${participantId}): ${(err as Error).message}`,
      );
    }
  }
}
