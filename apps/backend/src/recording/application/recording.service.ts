import { AudioBufferRepository, TranscriberPort } from '@/recording/domain/ports';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

/**
 * Recording Bounded Context의 Application Service.
 *
 * Reports BC 가 발행한 `report.transcription.requested` 를 받아 임시 오디오 버퍼를
 * 소비하고 `TranscriberPort` 로 STT 를 호출한 뒤, 결과를
 * `report.transcription.completed` / `failed` 로 발행한다(ARCHITECTURE §5).
 *
 * 본 서비스는 throw 하지 않는다. STT 실패는 정상 흐름의 일부이며, 모든 실패를
 * `failed` 이벤트로 표현해 Reports BC 의 Aggregate 가 cascade 처리하게 한다.
 */

export interface RequestTranscriptionCommand {
  reportId: string;
  meetingCode: string;
}

export interface RecordingServiceDeps {
  audioBufferRepository: AudioBufferRepository;
  transcriber: TranscriberPort;
  eventPublisher: DomainEventPublisher;
}

export class RecordingService {
  constructor(private readonly deps: RecordingServiceDeps) {}

  async requestTranscription(_command: RequestTranscriptionCommand): Promise<void> {
    throw new Error('RecordingService.requestTranscription not implemented');
  }
}
