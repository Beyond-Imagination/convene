import { Injectable, Logger } from '@nestjs/common';

import {
  AudioCapturePort,
  AudioCaptureStartInput,
} from '@/mediasoup/domain/ports';

/**
 * `AudioCapturePort` 의 placeholder 구현체.
 *
 * 호출만 받아 logger 에 기록할 뿐, 실제로 PlainTransport 도 ffmpeg 도 띄우지
 * 않는다. e2e 환경(컨테이너에 ffmpeg 없음)에서 SignalingService 의 audio
 * producer hook 이 동작은 하되 부수효과가 없도록 overrideProvider 로 주입한다.
 *
 * RecordingService 는 AudioBufferRepository.consume 결과가 빈 배열이면 transcribe
 * 호출 자체를 skip 하므로, 본 Noop 사용 시 전체 파이프라인은 빈 transcript 로
 * finalize 된다.
 */
@Injectable()
export class NoopAudioCapture implements AudioCapturePort {
  private readonly logger = new Logger(NoopAudioCapture.name);

  async start(input: AudioCaptureStartInput): Promise<void> {
    this.logger.debug(
      `Noop capture start (code=${input.meetingCode}, pid=${input.participantId}, producerId=${input.producerId})`,
    );
  }

  async stop(meetingCode: string, participantId: string): Promise<void> {
    this.logger.debug(`Noop capture stop (code=${meetingCode}, pid=${participantId})`);
  }

  async stopAll(meetingCode: string): Promise<void> {
    this.logger.debug(`Noop capture stopAll (code=${meetingCode})`);
  }
}
