/**
 * 회의 입장 코드. URL `/meetings/[code]`에서 사용된다.
 *
 * 포맷: 정확히 8자 소문자 영숫자.
 * 약 2.8 × 10^12 조합으로 현재 수준에선 충돌 가능성은 무시할 수준이다.
 */
const PATTERN = /^[a-z0-9]{8}$/;

export class MeetingCode {
  static readonly LENGTH = 8;

  private constructor(public readonly value: string) {}

  static from(raw: string): MeetingCode {
    if (!PATTERN.test(raw)) {
      throw new Error(
        `MeetingCode must be ${MeetingCode.LENGTH} lowercase alphanumeric chars, got "${raw}"`,
      );
    }
    return new MeetingCode(raw);
  }

  equals(other: MeetingCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
