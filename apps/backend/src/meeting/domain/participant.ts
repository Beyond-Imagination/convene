export interface ParticipantSnapshot {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 30;

/**
 * Meeting Aggregate 내부 Entity. 닉네임만으로 참여하는 게스트 참가자(회원 없음).
 *
 * Identity는 외부에서 부여한 `id`로 결정되며 `join → (선택적으로) leave` 라이프사이클을 갖는다.
 * 회의록(MeetingReport) 저장 시점에는 `ParticipantEntry` 인터페이스로 변환된다.
 */
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

  /**
   * snapshot으로부터 Participant를 복원한다.
   * Repository가 영속 저장소로부터 읽어들인 raw 상태를 그대로 도메인 객체로 되살리기 위한 진입점.
   *
   * 입력에 대한 형식 검증을 하지 않는다. 검증 책임은 snapshot 생성 시점에 있다.
   */
  static fromSnapshot(snapshot: ParticipantSnapshot): Participant {
    return new Participant(snapshot.id, snapshot.nickname, snapshot.joinedAt, snapshot.leftAt);
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

  /** Entity 동등성은 identity만으로 판단한다. 닉네임이 같아도 다른 Participant. */
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
