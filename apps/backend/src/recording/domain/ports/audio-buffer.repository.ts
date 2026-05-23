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
   * 누적 PCM 중 끝 `keepLastBytes` 만큼은 남기고 그 이전 데이터를 drain 한다.
   * 회의 중 PartialTranscriptionScheduler 가 매 N초 호출해 다음 chunk 의 wav
   * 입력을 만든다. `keepLastBytes` 만큼의 overlap 을 남겨 chunk 경계 단어
   * 잘림을 방지한다.
   *
   * - 누적량이 `keepLastBytes` 이하면 빈 pcm 반환 (drain 할 게 없음).
   * - 반환 `startMs` 는 drain 된 chunk 의 첫 byte 가 participant audio 시간축에서
   *   갖는 위치(ms). 첫 drain 은 0, 두번째 호출부터는 (이전 drain 끝 위치).
   * - `startedAtMs` 는 markStarted 값 (없으면 undefined).
   */
  drainAvailable(
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }>;

  /**
   * 누적 audio 가 살아있는 active 회의의 meetingCode 목록.
   * PartialTranscriptionScheduler 가 매 N 초 호출해 enumerate 한다.
   */
  listActiveMeetings(): Promise<string[]>;

  /**
   * 회의의 active participant id 목록. scheduler 가 회의별로 호출해 enumerate.
   */
  listActiveParticipants(meetingCode: string): Promise<string[]>;

  /**
   * 회의의 모든 참가자 누적 버퍼를 돌려주고 즉시 삭제한다. 누적된 참가자가
   * 없으면 `[]`. 같은 `participantId` 의 chunk 는 시간순으로 concat 된다.
   *
   * `startedAtMs` 는 `markStarted` 가 호출된 적이 있으면 그 값, 없으면 undefined.
   * `startMs` 는 잔여 audio 의 첫 byte 가 participant audio 시간축에서 갖는
   * 위치(ms). Phase 2 partial scheduler 가 사전 drain 한 양만큼 0 보다 클 수 있다.
   */
  consume(
    meetingCode: string,
  ): Promise<
    ReadonlyArray<{
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
    }>
  >;
}
