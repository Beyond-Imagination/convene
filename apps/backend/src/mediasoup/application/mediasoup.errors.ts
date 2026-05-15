/**
 * Mediasoup BC 의 application 에러. NestJS 의존성 없음(framework-free).
 * Interface layer 가 본 에러를 적절한 WsException/HttpException 으로 매핑한다.
 */

export class ParticipantMediaNotFoundError extends Error {
  constructor(public readonly participantId: string) {
    super(`ParticipantMedia for "${participantId}" not found`);
    this.name = 'ParticipantMediaNotFoundError';
  }
}
