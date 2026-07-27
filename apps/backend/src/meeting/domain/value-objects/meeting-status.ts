/**
 * 회의 생명주기.
 *   - 'scheduled' 코드·링크만 발급된 상태. 첫 참가자가 들어올 때까지 방(mediasoup 리소스)을 만들지 않는다.
 *   - 'open'      진행 중. idle 만료 판정은 이 상태에서만 적용된다.
 *   - 'closed'    종료됨.
 */
export const MEETING_STATUSES = ['scheduled', 'open', 'closed'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export function asMeetingStatus(raw: string): MeetingStatus {
  if (!(MEETING_STATUSES as readonly string[]).includes(raw)) {
    throw new Error(`MeetingStatus must be one of [${MEETING_STATUSES.join(', ')}], got "${raw}"`);
  }
  return raw as MeetingStatus;
}
