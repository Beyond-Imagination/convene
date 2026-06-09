export class MeetingNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Meeting "${code}" not found`);
    this.name = 'MeetingNotFoundError';
  }
}

/**
 * 회의 종료를 host 가 아닌 요청자가 시도했을 때. Interface 가
 * `ForbiddenException`(403)으로 매핑한다.
 */
export class NotHostError extends Error {
  constructor(public readonly code: string) {
    super(`Only the host can close meeting "${code}"`);
    this.name = 'NotHostError';
  }
}
