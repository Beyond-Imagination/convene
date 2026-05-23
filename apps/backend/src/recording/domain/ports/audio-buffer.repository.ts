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
   * 참가자의 capture 시작 시각(epoch ms)을 1회만 기록한다.
   * 같은 (code, pid) 에 대한 두 번째 호출은 무시(SETNX 의미) — RecordingService 가
   * 회의 시작 시각을 origin 으로 잡고 segment offset 을 normalize 할 때 본 값과
   * `command.meetingStartedAtMs` 의 차이를 더한다(중간 join 참가자 보정).
   */
  markStarted(
    meetingCode: string,
    participantId: string,
    startedAtMs: number,
  ): Promise<void>;

  /**
   * 회의의 모든 참가자 누적 버퍼를 돌려주고 즉시 삭제한다. 누적된 참가자가
   * 없으면 `[]`. 같은 `participantId` 의 chunk 는 시간순으로 concat 된다.
   *
   * `startedAtMs` 는 `markStarted` 가 호출된 적이 있으면 그 값, 없으면 undefined.
   */
  consume(
    meetingCode: string,
  ): Promise<ReadonlyArray<{ participantId: string; audio: Buffer; startedAtMs?: number }>>;
}
