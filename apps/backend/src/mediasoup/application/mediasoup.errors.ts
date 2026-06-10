import { ConflictError, NotFoundError } from '@/shared-kernel/domain/errors';

export class ParticipantMediaNotFoundError extends NotFoundError {
  constructor(public readonly participantId: string) {
    super(`ParticipantMedia for "${participantId}" not found`);
  }
}

export class ScreenShareConflictError extends ConflictError {
  constructor(public readonly meetingCode: string) {
    super(`Another participant is already sharing the screen in meeting "${meetingCode}"`);
  }
}
