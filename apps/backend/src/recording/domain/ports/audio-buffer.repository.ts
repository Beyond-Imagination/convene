/**
 * 회의별·참가자별 임시 오디오 버퍼의 영속/조회 경계.
 *
 * Mediasoup BC의 audio capture 어댑터가 참가자별로 PCM chunk를 흘려보내고, 회의 종료 시 RecordingService가 회의 단위로 한 번에 소비한다.
 * 같은 `(meetingCode, participantId)` 쌍 안에서는 append 순서가 보장되어야 한 명의 발화 시간축이 유지된다.
 *
 * `consume(code)`는 회의의 모든 참가자 버퍼를 한 번에 돌려주고 즉시 삭제한다(오디오는 STT 후 즉시 폐기, 장기 보존하지 않는다).
 */
export interface AudioBufferRepository {
  append(meetingCode: string, participantId: string, chunk: Buffer): Promise<void>;

  /**
   * 참가자의 capture 시작 시각(epoch ms)을 1회만 기록한다. 같은 (code, pid)에 대한 두 번째 호출은 무시(SETNX 의미)
   */
  markStarted(meetingCode: string, participantId: string, startedAtMs: number): Promise<void>;

  /**
   * 누적 PCM 중 끝 `keepLastBytes` 만큼은 남기고 그 이전 데이터를 drain 한다.
   * 다음 chunk의 wav 입력을 만든다.
   *
   * - `keepLastBytes` 만큼의 overlap을 남겨 chunk 경계 단어 잘림을 방지한다.
   * - 누적량이 `keepLastBytes` 이하면 빈 pcm 반환 (drain 할 게 없음).
   * - 반환 `startMs`는 drain 된 chunk의 첫 byte가 participant audio 시간축에서 갖는 위치(ms). 첫 drain은 0, 두번째 호출부터는 이전 drain 끝 위치.
   * - `startedAtMs`는 markStarted 값 (없으면 undefined).
   */
  drainAvailable(
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }>;

  listActiveMeetings(): Promise<string[]>;

  listActiveParticipants(meetingCode: string): Promise<string[]>;

  /**
   * 회의의 모든 참가자 누적 버퍼를 돌려주고 즉시 삭제한다. 누적된 참가자가 없으면 `[]`.
   * 같은 `participantId`의 chunk는 시간순으로 concat 된다.
   *
   * - `startedAtMs`는 `markStarted`가 호출된 적이 있으면 그 값, 없으면 undefined.
   * - `startMs`는 잔여 audio의 첫 byte가 participant audio 시간축에서 갖는 위치(ms).
   *   partial scheduler가 사전 drain 한 양만큼 0보다 클 수 있다.
   */
  consume(meetingCode: string): Promise<
    ReadonlyArray<{
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
    }>
  >;
}
