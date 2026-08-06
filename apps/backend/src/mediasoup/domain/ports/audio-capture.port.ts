export const AUDIO_CAPTURE = Symbol('AUDIO_CAPTURE');

/**
 * mediasoup audio producer의 RTP stream을 PlainTransport + ffmpeg으로 잡아 recording BC의 `AudioBufferRepository`로 보냄
 *
 */
export interface AudioCapturePort {
  /** 단일 participant의 capture 시작.*/
  start(input: AudioCaptureStartInput): Promise<void>;

  /** 단일 participant의 capture 종료. 없으면 no-op. */
  stop(meetingCode: string, participantId: string): Promise<void>;

  stopAll(meetingCode: string): Promise<void>;
}

export interface AudioCaptureStartInput {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly producerId: string;
}
