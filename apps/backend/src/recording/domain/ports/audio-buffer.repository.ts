/**
 * 회의별·참가자별 임시 오디오 버퍼의 영속/조회 경계.
 *
 * Mediasoup BC 의 audio capture 어댑터(FFmpeg) 가 참가자별로 PCM chunk 를
 * 흘려보내고, 회의 종료 시 RecordingService 가 회의 단위로 한 번에 소비한다.
 * 같은 `(meetingCode, participantId)` 쌍 안에서는 append 순서가 보장되어야
 * 한 명의 발화 시간축이 유지된다.
 *
 * `consume(code)` 는 회의의 모든 참가자 버퍼를 한 번에 돌려주고 **즉시 삭제**한다
 * (PLAN.md §3: "오디오는 STT 후 즉시 폐기, 장기 보존 X, S3 미사용").
 *
 * 누적된 참가자가 한 명도 없으면 빈 배열을 돌려준다.
 */
export interface AudioBufferRepository {
  append(meetingCode: string, participantId: string, chunk: Buffer): Promise<void>;

  /**
   * 회의의 모든 참가자 누적 버퍼를 `{ participantId, audio }` 배열로 돌려주고
   * 즉시 삭제한다. 누적된 참가자가 없으면 `[]`.
   * 결과 배열 안에서 같은 `participantId` 의 chunk 는 시간순으로 concat 된다.
   */
  consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<{ participantId: string; audio: Buffer }>>;
}
