/**
 * MeetingReport에 누적되는 채팅 한 건.
 * 회의 중에는 Meeting 컨텍스트의 일시 데이터(Redis)로 흐르다가,
 * `meeting.ended` 시점에 Report Aggregate로 이관된다(ARCHITECTURE §2.3).
 */
export interface ChatEntry {
  readonly nickname: string;
  readonly text: string;
  readonly sentAt: Date;
}

const NICKNAME_MAX = 30;
const TEXT_MAX = 2000;

export function chatEntry(input: {
  nickname: string;
  text: string;
  sentAt: Date;
}): ChatEntry {
  const nickname = input.nickname.trim();
  if (nickname.length === 0 || nickname.length > NICKNAME_MAX) {
    throw new Error(`ChatEntry.nickname must be 1~${NICKNAME_MAX} chars after trim`);
  }
  const text = input.text.trim();
  if (text.length === 0 || text.length > TEXT_MAX) {
    throw new Error(`ChatEntry.text must be 1~${TEXT_MAX} chars after trim`);
  }
  return { nickname, text, sentAt: input.sentAt };
}
