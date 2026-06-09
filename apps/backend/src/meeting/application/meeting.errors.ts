export class MeetingNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Meeting "${code}" not found`);
    this.name = 'MeetingNotFoundError';
  }
}

export class NotHostError extends Error {
  constructor(public readonly code: string) {
    super(`Only the host can close meeting "${code}"`);
    this.name = 'NotHostError';
  }
}
