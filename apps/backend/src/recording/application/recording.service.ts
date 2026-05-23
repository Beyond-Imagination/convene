import { REPORT_EVENTS } from '@migration/shared-interfaces';

import { AudioBufferRepository, TranscriberPort } from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

/**
 * Recording Bounded Context의 Application Service.
 *
 * Reports BC 가 발행한 `report.transcription.requested` 를 받아 회의의 참가자별
 * 누적 오디오 버퍼를 소비하고, 각 참가자 audio 에 대해 `TranscriberPort` 로 STT 를
 * 호출한다. 각 segment 에는 `speaker = participantId` 를 채워서 시간순으로 merge 한
 * 결과를 `report.transcription.completed` 로 발행한다.
 *
 * 참가자별 audio capture 의 시간축 origin (capture 시작 시각이 회의 시작 시각과
 * 어긋날 수 있음) 은 v1 에선 보정하지 않는다 — backlog. 참가자가 동시에 발화하는
 * 구간은 startMs 가 가까운 segment 들이 인접하게 정렬된다.
 *
 * 본 서비스는 throw 하지 않는다. STT 실패는 정상 흐름의 일부이며, 모든 실패를
 * `failed` 이벤트로 표현해 Reports BC 의 Aggregate 가 cascade 처리하게 한다.
 */

export interface RequestTranscriptionCommand {
  reportId: string;
  meetingCode: string;
  /**
   * 회의 시작 시각(epoch ms). 참가자별 capture 시작 시각을 본 origin 으로
   * normalize 해 segment.startMs/endMs 를 회의 시간축으로 보정한다.
   * 중간 join 한 참가자도 회의 시작점 기준으로 정렬된다.
   */
  meetingStartedAtMs: number;
}

export interface RecordingServiceDeps {
  audioBufferRepository: AudioBufferRepository;
  transcriber: TranscriberPort;
  eventPublisher: DomainEventPublisher;
}

export class RecordingService {
  constructor(private readonly deps: RecordingServiceDeps) {}

  async requestTranscription(command: RequestTranscriptionCommand): Promise<void> {
    try {
      const audios = await this.deps.audioBufferRepository.consume(command.meetingCode);
      if (audios.length === 0) {
        await this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_COMPLETED, {
          reportId: command.reportId,
          transcript: [],
        });
        return;
      }

      const merged: TranscriptionSegmentPayload[] = [];
      for (const { participantId, audio, startedAtMs } of audios) {
        // 참가자의 capture 시작 시각이 회의 시작보다 늦으면 그 차이만큼 segment
        // startMs/endMs 를 가산해 회의 시간축으로 normalize 한다. 누락 또는 음수
        // (회의 시작보다 이전) 는 0 으로 clamp — segment startMs 가 음수가 되지
        // 않도록 한다.
        const offset =
          startedAtMs !== undefined
            ? Math.max(0, startedAtMs - command.meetingStartedAtMs)
            : 0;
        const segments = await this.deps.transcriber.transcribe({
          meetingCode: command.meetingCode,
          audio,
        });
        for (const seg of segments) {
          merged.push({
            ...seg,
            startMs: seg.startMs + offset,
            endMs: seg.endMs + offset,
            speaker: participantId,
          });
        }
      }
      merged.sort((a, b) => a.startMs - b.startMs);

      await this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_COMPLETED, {
        reportId: command.reportId,
        transcript: merged,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_FAILED, {
        reportId: command.reportId,
        error,
      });
    }
  }
}
