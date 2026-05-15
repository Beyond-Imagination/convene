/**
 * Multi-Router 풀의 생성·정리·할당을 추상화한 도메인 포트.
 *
 * 구현체는 mediasoup `Worker`/`Router` 라이프사이클을 책임지며, application 레이어는
 * 본 인터페이스를 통해서만 라우터 자원에 접근한다. mediasoup-specific 타입은 본
 * 인터페이스에 노출되지 않는다 (RTP capabilities 는 `unknown` 으로 전달, 호출자가 cast).
 *
 * 회의 라이프사이클:
 *   1. 회의 생성 시 `createRoom(code)` → 워커 풀에서 라우터 N 개를 묶어 할당.
 *   2. 참가자 입장 시 `assignParticipant(code, participantId)` → routerIndex 반환.
 *   3. 참가자 퇴장 시 `releaseParticipant(code, participantId)`.
 *   4. 회의 종료 시 `closeRoom(code)` → 라우터·파이프·observer 일괄 정리.
 */
export interface MediaRouterPort {
  createRoom(meetingCode: string): Promise<void>;
  closeRoom(meetingCode: string): Promise<void>;

  /** mediasoup-client `Device.load({ routerRtpCapabilities })` 입력. */
  getRtpCapabilities(meetingCode: string): Promise<unknown>;

  /** 참가자에게 router 를 할당하고 그 인덱스를 반환한다. */
  assignParticipant(meetingCode: string, participantId: string): Promise<number>;

  releaseParticipant(meetingCode: string, participantId: string): Promise<void>;
}
