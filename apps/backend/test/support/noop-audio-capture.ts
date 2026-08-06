import { Injectable, Logger } from '@nestjs/common';

import { AudioCapturePort, AudioCaptureStartInput } from '@/mediasoup/domain/ports/audio-capture.port';

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
