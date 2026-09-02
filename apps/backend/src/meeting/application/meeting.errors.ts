import { ConflictError, ForbiddenError, NotFoundError } from '@/shared-kernel/domain/errors';

export class MeetingNotFoundError extends NotFoundError {
  constructor(public readonly code: string) {
    super(`Meeting "${code}" not found`);
  }
}

export class MeetingClosedError extends ConflictError {
  constructor(public readonly code: string) {
    super(`Meeting "${code}" is already closed`);
  }
}

export class NotHostError extends ForbiddenError {
  constructor(public readonly code: string) {
    super(`Only the host can close meeting "${code}"`);
  }
}
