export const AUDIO_BUFFER_REPOSITORY = Symbol('AUDIO_BUFFER_REPOSITORY');

/** 연속 오디오 한 덩이. 캡처가 끊겼던 구간을 사이에 두고 run 이 갈린다. */
export interface AudioRun {
  readonly pcm: Buffer;
  /** 첫 sample 의 절대 시각(epoch ms). */
  readonly startedAtMs: number;
}

/**
 * 회의별·참가자별 임시 오디오 버퍼의 영속/조회 경계.
 *
 * 각 chunk 가 자기 시각을 들고 다니므로 mute·ffmpeg 재시작·DTX 로 오디오가 비어도 보정이 없다 —
 * 그 구간에 chunk 가 없을 뿐이다. 무음을 채우지 않아 장시간 mute 에도 저장량이 늘지 않는다.
 *
 * `consume`은 돌려주는 즉시 삭제한다(오디오는 STT 후 즉시 폐기, 장기 보존하지 않는다).
 */
export interface AudioBufferRepository {
  /** @param startedAtMs 첫 sample 의 절대 시각. 호출자가 `도착 시각 - 재생 길이`로 계산한다. */
  append(
    meetingCode: string,
    participantId: string,
    chunk: Buffer,
    startedAtMs: number,
  ): Promise<void>;

  /**
   * 누적분을 run 단위로 drain 한다. 마지막 run 의 꼬리 `keepLastBytes` 는 단어 잘림 방지로 남긴다
   * — 앞선 run 들은 뒤와 이어지지 않으므로 통째로 나간다.
   */
  drainAvailable(
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<ReadonlyArray<AudioRun>>;

  listActiveMeetings(): Promise<string[]>;

  listActiveParticipants(meetingCode: string): Promise<string[]>;

  /** 회의의 모든 참가자 버퍼를 run 단위로 돌려주고 즉시 삭제한다. */
  consume(meetingCode: string): Promise<
    ReadonlyArray<{
      participantId: string;
      runs: ReadonlyArray<AudioRun>;
    }>
  >;
}
