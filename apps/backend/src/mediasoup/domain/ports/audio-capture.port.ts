/**
 * 회의 audio capture 의 도메인 포트.
 *
 * mediasoup audio producer 의 RTP stream 을 PlainTransport + ffmpeg 등으로 잡아
 * recording BC 의 `AudioBufferRepository` 로 흘려보내는 책임을 추상화한다.
 *
 * SignalingService 의 `produce`(kind='audio') 가 start 를, `dismissParticipant`/
 * `closeRoom` 이 stop/stopAll 을 호출한다.
 *
 * 모든 메서드는 idempotent — 같은 (meetingCode, participantId) 에 대한 중복
 * 호출은 dedup 으로 처리한다([[feedback-mediasoup-no-race]] 원칙).
 *
 * start 는 실패해도 throw 하지 않는다(회의 본 흐름을 막지 않기 위함). 실패는
 * 구현체가 logger 에 기록한다.
 */
export interface AudioCapturePort {
  start(input: AudioCaptureStartInput): Promise<void>;

  /** 단일 participant 의 capture 종료. 없으면 no-op. */
  stop(meetingCode: string, participantId: string): Promise<void>;

  /** 회의 단위로 모든 participant 의 capture 종료. */
  stopAll(meetingCode: string): Promise<void>;
}

export interface AudioCaptureStartInput {
  readonly meetingCode: string;
  readonly participantId: string;
  readonly producerId: string;
}
