import { REPORT_EVENTS } from '@convene/shared-interfaces';
import { Inject, Injectable } from '@nestjs/common';

import { AUDIO_BUFFER_REPOSITORY, AudioBufferRepository } from '@/recording/domain/ports/audio-buffer.repository';
import { AbsoluteTranscriptSegment, PARTIAL_TRANSCRIPT_STORE, PartialTranscriptStore } from '@/recording/domain/ports/partial-transcript.store';
import { TRANSCRIBER, TranscriberPort } from '@/recording/domain/ports/transcriber.port';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { NestEventBusDomainEventPublisher } from '@/shared-kernel/infrastructure/nest-event-bus.publisher';
import { PinoLoggerAdapter } from '@/shared-kernel/infrastructure/pino-logger.adapter';

import { dropOverlapHeadSegments, splitPcmIntoWavChunks } from '../infrastructure/audio-chunker';

export interface RequestTranscriptionCommand {
  reportId: string;
  meetingCode: string;
  /** 회의 시작 시각(epoch ms). 절대 시각인 segment 를 이 기준의 relative ms 로 정규화한다. */
  meetingStartedAtMs: number;
  /**
   * participantId(socket id) → 표시용 nickname 매핑.
   * STT는 화자 식별을 내부 participantId로만 하므로, 회의록에 들어갈 transcript의 speaker를 여기서 nickname으로 채워 발행한다
   * (소비처인 Reports가 재가공하지 않도록 생산 시점에 올바른 형태로 만든다).
   * 매칭 없으면 원본 participantId 유지.
   */
  participantNames?: Readonly<Record<string, string>>;
}

/**
 * 회의 오디오를 STT로 전사하는 서비스.
 *
 * Reports BC가 발행한 이벤트를 받아 참가자별 누적 오디오를 소비하고 `TranscriberPort`로 STT를 호출한다.
 * 각 segment에 `speaker = participantId`를 채워 시간순 merge 한 결과를 `report.transcription.completed`로 발행한다.
 *
 * 본 서비스는 throw 하지 않는다. STT 실패는 정상 흐름의 일부이며, 모든 실패를 `failed` 이벤트로 표현해 Reports BC가 처리하게 한다.
 */
@Injectable()
export class RecordingService {
  constructor(
    @Inject(AUDIO_BUFFER_REPOSITORY) private readonly audioBufferRepository: AudioBufferRepository,
    @Inject(PARTIAL_TRANSCRIPT_STORE) private readonly partialTranscriptStore: PartialTranscriptStore,
    @Inject(TRANSCRIBER) private readonly transcriber: TranscriberPort,
    private readonly eventPublisher: NestEventBusDomainEventPublisher,
    private readonly logger: PinoLoggerAdapter,
  ) {}

  async requestTranscription(command: RequestTranscriptionCommand): Promise<void> {
    try {
      // 1) partial scheduler가 누적해 둔 segments를 가져온다(절대 epoch ms).
      const partial = await this.partialTranscriptStore.consume(command.meetingCode);
      // 2) 회의 종료 시점의 잔여 audio를 run 단위로 consume.
      const audios = await this.audioBufferRepository.consume(command.meetingCode);

      if (partial.length === 0 && audios.length === 0) {
        await this.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_COMPLETED, {
          reportId: command.reportId,
          transcript: [],
        });
        this.logger.info(
          { reportId: command.reportId, meetingCode: command.meetingCode, segments: 0 },
          'transcription completed',
        );
        return;
      }

      // 3) partial + 잔여 STT 결과를 모두 절대 시간축으로 모은 뒤, 회의 종료 시 한 번에 회의 시작 origin 기준 relative ms로 정규화한다.
      const absolute: AbsoluteTranscriptSegment[] = [...partial];

      for (const { participantId, runs } of audios) {
        for (const run of runs) {
          const originMs = Math.max(run.startedAtMs, command.meetingStartedAtMs);
          const chunks = splitPcmIntoWavChunks(run.pcm);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const rawSegments = await this.transcriber.transcribe({
              meetingCode: command.meetingCode,
              participantId,
              audio: chunk.wav,
            });
            const segments = dropOverlapHeadSegments(rawSegments, i === 0);
            for (const seg of segments) {
              absolute.push({
                speaker: participantId,
                text: seg.text,
                absoluteStartMs: originMs + chunk.startMs + seg.startMs,
                absoluteEndMs: originMs + chunk.startMs + seg.endMs,
              });
            }
          }
        }
      }

      // 4) absolute → meetingStartedAtMs 기준 relative + clamp 0 + 시간순 sort.
      //    speaker(participantId)는 participantNames 매핑으로 nickname으로 치환한다.
      const names = command.participantNames ?? {};
      const merged: TranscriptionSegmentPayload[] = absolute
        .map((s) => ({
          speaker: names[s.speaker] ?? s.speaker,
          text: s.text,
          startMs: Math.max(0, s.absoluteStartMs - command.meetingStartedAtMs),
          endMs: Math.max(0, s.absoluteEndMs - command.meetingStartedAtMs),
        }))
        .sort((a, b) => a.startMs - b.startMs);

      await this.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_COMPLETED, {
        reportId: command.reportId,
        transcript: merged,
      });
      this.logger.info(
        { reportId: command.reportId, meetingCode: command.meetingCode, segments: merged.length },
        'transcription completed',
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { reportId: command.reportId, meetingCode: command.meetingCode, err },
        'transcription failed',
      );
      await this.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_FAILED, {
        reportId: command.reportId,
        error,
      });
    }
  }
}
