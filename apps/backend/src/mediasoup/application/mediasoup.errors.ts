/**
 * Mediasoup 의 application 에러. 던져지면 Interface 가 WsException/HttpException
 * 으로 매핑한다.
 */

export class ParticipantMediaNotFoundError extends Error {
  constructor(public readonly participantId: string) {
    super(`ParticipantMedia for "${participantId}" not found`);
    this.name = 'ParticipantMediaNotFoundError';
  }
}

/**
 * 이미 다른 참가자가 화면을 공유 중인데 또 다른 참가자가 screen produce 를
 * 시도했을 때. 화면 공유는 회의당 동시 1인만 허용한다(v1 제약).
 */
export class ScreenShareConflictError extends Error {
  constructor(public readonly meetingCode: string) {
    super(`Another participant is already sharing the screen in meeting "${meetingCode}"`);
    this.name = 'ScreenShareConflictError';
  }
}
