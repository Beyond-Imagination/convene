/**
 * 회의 유형. 회의록 삽입 위치·요약 포맷을 가르는 축.
 *   - 'general'       v1.0.0 기본(web 회의). toggle wrapper로 삽입.
 *   - 'retrospective' 월/분기/년 회고 회의. 페이지 회고 섹션에 삽입.
 *   - 'weekly-sync'   주간 공유 회의(백로그).
 */
export const MEETING_TYPES = ['general', 'retrospective', 'weekly-sync'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const DEFAULT_MEETING_TYPE: MeetingType = 'general';

export function asMeetingType(raw: string): MeetingType {
  if (!(MEETING_TYPES as readonly string[]).includes(raw)) {
    throw new Error(`MeetingType must be one of [${MEETING_TYPES.join(', ')}], got "${raw}"`);
  }
  return raw as MeetingType;
}
