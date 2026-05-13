/**
 * Meeting Aggregate 내부 Entity. 닉네임만으로 참여하는 게스트 참가자(회원 없음).
 *
 * Identity는 외부에서 부여한 `id`(소켓 단위 식별자 등)로 결정되며
 * `join → (선택적으로) leave` 라이프사이클을 갖는다.
 *
 * 회의록(MeetingReport) 저장 시점에는 `ParticipantEntry` 인터페이스로 변환된다.
 * (PLAN.md §5 / ARCHITECTURE.md §2.3)
 */

export interface ParticipantSnapshot {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 30;

export class Participant {
  private constructor(
    public readonly id: string,
    public readonly nickname: string,
    public readonly joinedAt: Date,
    private _leftAt: Date | null = null,
  ) {}

  static join(id: string, nickname: string, at: Date): Participant {
    if (!id || id.trim() === '') {
      throw new Error('Participant.id must be a non-empty string');
    }
    const trimmed = (nickname ?? '').trim();
    if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
      throw new Error(
        `Participant.nickname must be ${NICKNAME_MIN}~${NICKNAME_MAX} chars after trim, got "${nickname}"`,
      );
    }
    return new Participant(id, trimmed, at);
  }

  leave(at: Date): void {
    if (this._leftAt !== null) {
      throw new Error('Participant has already left');
    }
    if (at.getTime() < this.joinedAt.getTime()) {
      throw new Error('Participant.leftAt cannot be earlier than joinedAt');
    }
    this._leftAt = at;
  }

  get leftAt(): Date | null {
    return this._leftAt;
  }

  get isActive(): boolean {
    return this._leftAt === null;
  }

  /** Entity 동등성은 identity(`id`)만으로 판단한다. 닉네임이 같아도 다른 Participant. */
  equals(other: Participant): boolean {
    return this.id === other.id;
  }

  snapshot(): ParticipantSnapshot {
    return {
      id: this.id,
      nickname: this.nickname,
      joinedAt: this.joinedAt,
      leftAt: this._leftAt,
    };
  }
}
