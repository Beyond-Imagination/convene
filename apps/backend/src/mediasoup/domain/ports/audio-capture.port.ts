export const AUDIO_CAPTURE = Symbol('AUDIO_CAPTURE');

export type CaptureStopReason = 'muted' | 'left';

/**
 * mediasoup audio producer의 RTP stream을 PlainTransport + ffmpeg으로 잡아 recording BC의 `AudioBufferRepository`로 보냄
 *
 */
export interface AudioCapturePort {
  /** 단일 participant의 capture 시작.*/
  start(input: AudioCaptureStartInput): Promise<void>;

  /**
   * 단일 participant의 capture 종료. 없으면 no-op.
   *
   * `muted` 는 곧 돌아올 수 있다는 뜻이라 배선을 잠시 살려 둔다 — 마이크를 자주 껐다 켜도
   * 프로세스를 다시 만들지 않고, 다시 켤 때 지연 없이 이어진다.
   */
  stop(meetingCode: string, participantId: string, reason?: CaptureStopReason): Promise<void>;

  stopAll(meetingCode: string): Promise<void>;
}

export interface AudioCaptureStartInput {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly producerId: string;
}
