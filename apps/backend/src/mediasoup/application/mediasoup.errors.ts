export class ParticipantMediaNotFoundError extends Error {
  constructor(public readonly participantId: string) {
    super(`ParticipantMedia for "${participantId}" not found`);
    this.name = 'ParticipantMediaNotFoundError';
  }
}

export class ScreenShareConflictError extends Error {
  constructor(public readonly meetingCode: string) {
    super(`Another participant is already sharing the screen in meeting "${meetingCode}"`);
    this.name = 'ScreenShareConflictError';
  }
}
