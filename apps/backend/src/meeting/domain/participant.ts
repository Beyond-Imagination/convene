export interface ParticipantSnapshot {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
  /** 구버전 snapshot에는 없으므로 복원 시 id로 대체한다. */
  readonly connectionId?: string;
  readonly disconnectedAt?: Date | null;
}

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 30;

/**
 * Meeting Aggregate 내부 Entity. 닉네임만으로 참여하는 게스트 참가자(회원 없음).
 *
 * `id`는 클라이언트가 보관하는 안정 식별자, `connectionId`는 재연결마다 교체되는 소켓이다.
 * 라이프사이클: `join → (disconnect ⇄ reconnect)* → leave`.
 */
export class Participant {
  private constructor(
    public readonly id: string,
    public readonly nickname: string,
    public readonly joinedAt: Date,
    private _connectionId: string,
    private _leftAt: Date | null = null,
    private _disconnectedAt: Date | null = null,
  ) {}

  static join(id: string, nickname: string, at: Date, connectionId?: string): Participant {
    if (!id || id.trim() === '') {
      throw new Error('Participant.id must be a non-empty string');
    }
    const trimmed = (nickname ?? '').trim();
    if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
      throw new Error(
        `Participant.nickname must be ${NICKNAME_MIN}~${NICKNAME_MAX} chars after trim, got "${nickname}"`,
      );
    }
    return new Participant(id, trimmed, at, connectionId ?? id);
  }

  /**
   * snapshot으로부터 Participant를 복원한다.
   * Repository가 영속 저장소로부터 읽어들인 raw 상태를 그대로 도메인 객체로 되살리기 위한 진입점.
   *
   * 입력에 대한 형식 검증을 하지 않는다. 검증 책임은 snapshot 생성 시점에 있다.
   */
  static fromSnapshot(snapshot: ParticipantSnapshot): Participant {
    return new Participant(
      snapshot.id,
      snapshot.nickname,
      snapshot.joinedAt,
      snapshot.connectionId ?? snapshot.id,
      snapshot.leftAt,
      snapshot.disconnectedAt ?? null,
    );
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

  /** 중복 호출은 처음 시각을 유지한다 — 끊김 알림이 두 번 와도 유예가 연장되면 안 된다. */
  disconnect(at: Date): void {
    this.assertNotLeft('disconnect');
    if (this._disconnectedAt !== null) return;
    this._disconnectedAt = at;
  }

  /** 끊긴 적 없어도 호출 가능하다 — 새로고침이 이전 소켓의 disconnect를 앞지를 수 있다. */
  reconnect(connectionId: string, at: Date): void {
    this.assertNotLeft('reconnect');
    this.assertNotBeforeJoin(at, 'reconnect');
    this._connectionId = connectionId;
    this._disconnectedAt = null;
  }

  /** 유예 만료 후 복귀. 회의록에 같은 사람이 두 번 실리지 않도록 최초 입장 시각을 유지한다. */
  rejoin(connectionId: string, at: Date): void {
    this.assertNotBeforeJoin(at, 'rejoin');
    this._connectionId = connectionId;
    this._leftAt = null;
    this._disconnectedAt = null;
  }

  get leftAt(): Date | null {
    return this._leftAt;
  }

  get isActive(): boolean {
    return this._leftAt === null;
  }

  get connectionId(): string {
    return this._connectionId;
  }

  get disconnectedAt(): Date | null {
    return this._disconnectedAt;
  }

  get isDisconnected(): boolean {
    return this._disconnectedAt !== null;
  }

  isDisconnectedLongerThan(graceMs: number, now: Date): boolean {
    if (this._disconnectedAt === null) return false;
    return now.getTime() - this._disconnectedAt.getTime() >= graceMs;
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
      connectionId: this._connectionId,
      disconnectedAt: this._disconnectedAt,
    };
  }

  private assertNotLeft(op: string): void {
    if (this._leftAt !== null) {
      throw new Error(`Cannot ${op}: participant has already left`);
    }
  }

  private assertNotBeforeJoin(at: Date, op: string): void {
    if (at.getTime() < this.joinedAt.getTime()) {
      throw new Error(`Participant.${op} cannot be earlier than joinedAt`);
    }
  }
}
