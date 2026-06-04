/**
 * MeetingReport에 영속되는 참가자 한 명의 데이터.
 *
 * Meeting Aggregate가 보유한 `Participant.snapshot()` 결과와 동형이며,
 * `meeting.ended` 시점에 Report로 이관된다.
 *
 * Meeting 컨텍스트의 `Participant`는 mutating Entity인 반면, 본 Entry는
 * 회의 종료 후 영속 도큐먼트에 들어가는 readonly 스냅숏이다.
 */
export interface ParticipantEntry {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

const NICKNAME_MAX = 30;

export function participantEntry(input: {
  id: string;
  nickname: string;
  joinedAt: Date;
  leftAt: Date | null;
}): ParticipantEntry {
  const id = input.id.trim();
  if (id.length === 0) {
    throw new Error('ParticipantEntry.id must be non-empty');
  }
  const nickname = input.nickname.trim();
  if (nickname.length === 0 || nickname.length > NICKNAME_MAX) {
    throw new Error(`ParticipantEntry.nickname must be 1~${NICKNAME_MAX} chars after trim`);
  }
  if (input.leftAt !== null && input.leftAt.getTime() < input.joinedAt.getTime()) {
    throw new Error('ParticipantEntry.leftAt cannot be earlier than joinedAt');
  }
  return { id, nickname, joinedAt: input.joinedAt, leftAt: input.leftAt };
}
