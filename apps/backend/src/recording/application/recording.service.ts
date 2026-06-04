import { REPORT_EVENTS } from '@convene/shared-interfaces';

import {
  AbsoluteTranscriptSegment,
  AudioBufferRepository,
  PartialTranscriptStore,
  TranscriberPort,
} from '@/recording/domain/ports';
import { TranscriptionSegmentPayload } from '@/shared-kernel/domain/events';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

import {
  dropOverlapHeadSegments,
  splitPcmIntoWavChunks,
} from '../infrastructure/audio-chunker';

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
  /**
   * participantId(socket id) → 표시용 nickname 매핑. STT 는 화자 식별을
   * 내부 participantId 로만 하므로, 회의록에 들어갈 transcript 의 speaker 를
   * 여기서 nickname 으로 채워 발행한다(소비처인 Reports 가 재가공하지 않도록
   * 생산 시점에 올바른 형태로 만든다). 매칭 없으면 원본 participantId 유지.
   */
  participantNames?: Readonly<Record<string, string>>;
}

export interface RecordingServiceDeps {
  audioBufferRepository: AudioBufferRepository;
  partialTranscriptStore: PartialTranscriptStore;
  transcriber: TranscriberPort;
  eventPublisher: DomainEventPublisher;
}

export class RecordingService {
  constructor(private readonly deps: RecordingServiceDeps) {}

  async requestTranscription(command: RequestTranscriptionCommand): Promise<void> {
    try {
      // 1) partial scheduler 가 누적해 둔 segments 를 가져온다(절대 epoch ms).
      const partial = await this.deps.partialTranscriptStore.consume(command.meetingCode);
      // 2) 회의 종료 시점의 잔여 audio 를 consume. scheduler 가 사전 drain 한 만큼은
      //    `startMs`(시간축 위치) 로 표현된다.
      const audios = await this.deps.audioBufferRepository.consume(command.meetingCode);

      if (partial.length === 0 && audios.length === 0) {
        await this.deps.eventPublisher.publish(REPORT_EVENTS.TRANSCRIPTION_COMPLETED, {
          reportId: command.reportId,
          transcript: [],
        });
        return;
      }

      // 3) partial + 잔여 STT 결과를 모두 절대 시간축(epoch ms) 으로 모은 뒤,
      //    회의 종료 시 한 번에 회의 시작 origin 기준 relative ms 로 정규화한다.
      const absolute: AbsoluteTranscriptSegment[] = [...partial];

      for (const { participantId, audio, startedAtMs, startMs: consumeStartMs } of audios) {
        // 회의 시간축 origin(절대 시각). 두 가지 clamp:
        // - startedAtMs 누락 → 회의 시작 시각 사용(participant offset = 0).
        // - startedAtMs 가 회의 시작보다 이전 → 회의 시작 시각으로 clamp(음수 offset
        //   방지). 이 경우 segment 의 endMs 까지 깎이지 않도록 normalize 단계가 아니
        //   라 origin 자체를 미리 clamp 한다.
        const originMs =
          startedAtMs !== undefined
            ? Math.max(startedAtMs, command.meetingStartedAtMs)
            : command.meetingStartedAtMs;
        // scheduler 가 사전 drain 한 시간축 위치. drain 없었으면 0.
        const baseAudioMs = consumeStartMs ?? 0;
        const chunks = splitPcmIntoWavChunks(audio);
        const hadPriorPartial = baseAudioMs > 0;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const rawSegments = await this.deps.transcriber.transcribe({
            meetingCode: command.meetingCode,
            audio: chunk.wav,
          });
          // chunk 경계 dedup — 첫 chunk(i=0) 라도 직전에 partial scheduler 가 사전
          // drain 한 적이 있으면(baseAudioMs > 0) 그 끝과 overlap 으로 중복 가능.
          const isFirstChunk = i === 0 && !hadPriorPartial;
          const segments = dropOverlapHeadSegments(rawSegments, isFirstChunk);
          for (const seg of segments) {
            absolute.push({
              speaker: participantId,
              text: seg.text,
              absoluteStartMs: originMs + baseAudioMs + chunk.startMs + seg.startMs,
              absoluteEndMs: originMs + baseAudioMs + chunk.startMs + seg.endMs,
            });
          }
        }
      }

      // 4) absolute → meetingStartedAtMs 기준 relative + clamp 0 + 시간순 sort.
      //    speaker(participantId) 는 participantNames 매핑으로 nickname 으로 치환한다.
      const names = command.participantNames ?? {};
      const merged: TranscriptionSegmentPayload[] = absolute
        .map((s) => ({
          speaker: names[s.speaker] ?? s.speaker,
          text: s.text,
          startMs: Math.max(0, s.absoluteStartMs - command.meetingStartedAtMs),
          endMs: Math.max(0, s.absoluteEndMs - command.meetingStartedAtMs),
        }))
        .sort((a, b) => a.startMs - b.startMs);

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
