export const MEDIA_ROUTER = Symbol('MEDIA_ROUTER');

/**
 * Multi-Router 풀의 생성·정리·할당
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

  /** 참가자에게 router를 할당하고 그 인덱스를 반환한다. */
  assignParticipant(meetingCode: string, participantId: string): Promise<number>;

  releaseParticipant(meetingCode: string, participantId: string): Promise<void>;

  /**
   * 회의의 sourceRouterIndex에 있는 producer를 그 회의의 다른 모든 router로 pipe 한다. routersPerRoom === 1 이면 no-op.
   *
   * mediasoup의 `router.pipeToRouter({ producerId, router: target })`는 target 측에 동일 id의 producer를 생성해,
   * target router의 transport에서도 `transport.consume({ producerId })`가 동작하게 한다.
   */
  pipeProducerToAllRouters(
    meetingCode: string,
    producerId: string,
    sourceRouterIndex: number,
  ): Promise<void>;

  /**
   * producer 종료 시 그에 묶인 모든 pipeProducer를 close 한다. close 자체는 idempotent — 호출이 중복돼도 안전.
   */
  cleanupPipeProducers(meetingCode: string, producerId: string): Promise<void>;
}
