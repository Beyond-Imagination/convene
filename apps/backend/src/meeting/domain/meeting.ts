import { ExternalReference, Source } from '@/shared-kernel/domain/value-objects';

import { Participant, ParticipantSnapshot } from './participant';
import { IdleTimeout, MeetingCode } from './value-objects';

/**
 * 회의 한 건. Bounded Context 'Meeting'의 Aggregate Root.
 *
 * 책임:
 *   - 참가자(Participant Entity) 컬렉션 관리(join/leave).
 *   - 활동 시각(`lastActiveAt`) 추적과 idle 만료 판정(`isIdleSince`).
 *   - 종료(`close`) 시 모든 mutating 메서드를 거부.
 *
 * 도메인 이벤트는 직접 발행하지 않는다. Application Service가 본 Aggregate의
 * 메서드 호출 결과를 보고 `@nestjs/event-emitter`로 발행한다
 * (ARCHITECTURE.md §2.4, §3).
 *
 * `code` 유일성은 Repository 책임이며 본 Aggregate에서는 형식만 신뢰한다.
 */

export interface MeetingSnapshot {
  readonly code: string;
  readonly source: Source;
  readonly externalReference: ExternalReference;
  readonly idleTimeoutMs: number;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly lastActiveAt: Date;
  readonly participants: ReadonlyArray<ParticipantSnapshot>;
  /** 회의 종료 권한자(host) 식별용 비밀 토큰. 생성자만 보관한다. */
  readonly hostToken: string;
}

export interface CreateMeetingInput {
  code: MeetingCode;
  source: Source;
  externalReference: ExternalReference;
  idleTimeout: IdleTimeout;
  startedAt: Date;
  /**
   * 회의 종료 권한자(host) 식별용 비밀 토큰. 회의 생성 시 서버가 발급해
   * 생성자에게만 전달하며, 회의 종료 요청 시 이 토큰을 제시한 요청자만 통과시킨다.
   * socket id 와 달리 새로고침/재접속해도 유지된다.
   */
  hostToken: string;
}

export class Meeting {
  private readonly participants = new Map<string, Participant>();
  private _lastActiveAt: Date;
  private _endedAt: Date | null = null;

  private constructor(
    public readonly code: MeetingCode,
    public readonly source: Source,
    public readonly externalReference: ExternalReference,
    public readonly idleTimeout: IdleTimeout,
    public readonly startedAt: Date,
    public readonly hostToken: string,
  ) {
    this._lastActiveAt = startedAt;
  }

  static create(input: CreateMeetingInput): Meeting {
    return new Meeting(
      input.code,
      input.source,
      input.externalReference,
      input.idleTimeout,
      input.startedAt,
      input.hostToken,
    );
  }

  /**
   * snapshot 으로부터 Meeting Aggregate 를 복원한다. Repository(Redis 등) 가
   * 영속 저장소에서 읽어들인 raw 상태를 그대로 도메인 객체로 되살린다.
   *
   * 입력 데이터는 신뢰 가능한 snapshot 이라는 trust 하에 형식 검증은
   * `MeetingCode.from` / `IdleTimeout.of` 만 통과하면 그대로 받아들인다.
   * 참가자도 `Participant.fromSnapshot` 으로 일괄 복원한다.
   */
  static fromSnapshot(snapshot: MeetingSnapshot): Meeting {
    const meeting = new Meeting(
      MeetingCode.from(snapshot.code),
      snapshot.source,
      snapshot.externalReference,
      IdleTimeout.of(snapshot.idleTimeoutMs),
      snapshot.startedAt,
      snapshot.hostToken,
    );
    meeting._lastActiveAt = snapshot.lastActiveAt;
    meeting._endedAt = snapshot.endedAt;
    for (const p of snapshot.participants) {
      meeting.participants.set(p.id, Participant.fromSnapshot(p));
    }
    return meeting;
  }

  // ---------- mutations ----------

  addParticipant(id: string, nickname: string, at: Date): Participant {
    this.assertOpen('addParticipant');
    if (this.participants.has(id)) {
      throw new Error(`Participant with id "${id}" already exists in this meeting`);
    }
    const participant = Participant.join(id, nickname, at);
    this.participants.set(id, participant);
    this.touchActive(at);
    return participant;
  }

  removeParticipant(id: string, at: Date): Participant {
    this.assertOpen('removeParticipant');
    const participant = this.participants.get(id);
    if (!participant) {
      throw new Error(`Participant with id "${id}" not found in this meeting`);
    }
    if (!participant.isActive) {
      throw new Error(`Participant with id "${id}" has already left`);
    }
    participant.leave(at);
    this.touchActive(at);
    return participant;
  }

  /** 채팅·미디어 활동 등 idle 윈도우를 리셋해야 할 때 호출. */
  markActive(at: Date): void {
    this.assertOpen('markActive');
    this.touchActive(at);
  }

  close(at: Date): void {
    if (this._endedAt !== null) {
      throw new Error('Meeting is already closed');
    }
    if (at.getTime() < this.startedAt.getTime()) {
      throw new Error('Meeting.endedAt cannot be earlier than startedAt');
    }
    // 운영 강제 종료에 대비해 활성 참가자는 모두 같은 시각으로 leave 처리한다.
    for (const p of this.participants.values()) {
      if (p.isActive) {
        p.leave(at);
      }
    }
    this._endedAt = at;
  }

  // ---------- queries ----------

  get endedAt(): Date | null {
    return this._endedAt;
  }

  get lastActiveAt(): Date {
    return this._lastActiveAt;
  }

  get isOpen(): boolean {
    return this._endedAt === null;
  }

  /** 제시한 토큰이 이 회의의 hostToken 과 일치하면 host. 빈 토큰은 항상 거부. */
  isHost(token: string): boolean {
    return token.length > 0 && token === this.hostToken;
  }

  /** 닉네임 조회 등 read-only 용도. leave한 Participant도 반환한다. */
  findParticipant(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  /** 아직 leave 하지 않은 참가자 수. */
  get activeParticipantCount(): number {
    let n = 0;
    for (const p of this.participants.values()) {
      if (p.isActive) n++;
    }
    return n;
  }

  /**
   * 활성 참가자가 0이고 마지막 활동으로부터 `idleTimeout` 이상 경과했으면 true.
   * 활성 참가자가 한 명이라도 있으면 항상 false
   * (ARCHITECTURE.md §2.3 불변식: idle 타이머는 0명이 된 순간부터만 작동).
   */
  isIdleSince(now: Date): boolean {
    if (this.activeParticipantCount > 0) return false;
    const elapsed = now.getTime() - this._lastActiveAt.getTime();
    return elapsed >= this.idleTimeout.milliseconds;
  }

  snapshot(): MeetingSnapshot {
    return {
      code: this.code.value,
      source: this.source,
      externalReference: this.externalReference,
      idleTimeoutMs: this.idleTimeout.milliseconds,
      startedAt: this.startedAt,
      endedAt: this._endedAt,
      lastActiveAt: this._lastActiveAt,
      participants: Array.from(this.participants.values()).map((p) => p.snapshot()),
      hostToken: this.hostToken,
    };
  }

  // ---------- internals ----------

  private assertOpen(op: string): void {
    if (this._endedAt !== null) {
      throw new Error(`Cannot ${op}: meeting is already closed`);
    }
  }

  /** lastActiveAt은 monotonic — 과거 시각이 들어와도 뒤로 되돌리지 않는다. */
  private touchActive(at: Date): void {
    if (at.getTime() > this._lastActiveAt.getTime()) {
      this._lastActiveAt = at;
    }
  }
}
