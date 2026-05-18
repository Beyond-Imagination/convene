/**
 * 회의별 임시 오디오 버퍼의 영속/조회 경계.
 *
 * 구현체는 v1 부트스트랩에서 in-memory(테스트/회의 1건 규모) 를 제공하며,
 * 운영에서는 백엔드 임시 디스크로 교체할 수 있다(PLAN.md §3).
 *
 * 회의 종료 후 STT 가 끝나면 `consume(code)` 는 **반환과 동시에 삭제**한다.
 * PLAN.md §3: "오디오는 STT 후 즉시 폐기, 장기 보존 X, S3 미사용".
 *
 * append 가 한 번도 호출되지 않은 회의(오디오 capture 미구현 상태)는
 * `consume` 이 `null` 을 돌려준다.
 */
export interface AudioBufferRepository {
  append(meetingCode: string, chunk: Buffer): Promise<void>;

  /** 누적 버퍼를 한 번에 돌려주고 즉시 삭제한다. 누적된 적이 없으면 `null`. */
  consume(meetingCode: string): Promise<Buffer | null>;
}
