import { MediaType, TransportDirection } from '@migration/shared-interfaces';

/**
 * Mediasoup BC 의 Aggregate Root. 한 회의에 참여한 **한 명의 미디어 상태**를 표현한다.
 *
 * - identity 는 `participantId`(Meeting BC 의 `Participant.id` 와 동일한 socket id).
 * - `meetingCode` 는 그룹 키로, Mediasoup BC 의 application 서비스가
 *   같은 회의의 다른 ParticipantMedia 들을 묶어 브로드캐스트 대상을 결정한다.
 * - `routerIndex` 는 multi-router 전략에서 infrastructure 의 `MediaRouterPort`
 *   가 할당해 준 라우터 인덱스. 도메인은 값을 신뢰하고 검증·재할당하지 않는다.
 * - mediasoup 라이브러리 객체(`Transport`/`Producer`/`Consumer`)는 본 클래스에
 *   들어오지 않는다. 식별자(string)와 wire format VO 만 보유한다.
 */

export interface ProducerInfo {
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
  /**
   * produce 시점의 mute 상태. 기본 OFF(audio/video)로 입장하는 참가자는 true 로
   * 추가돼, 늦게 입장한 다른 참가자의 LIST_PRODUCERS/NEW_PRODUCER 에 정확한 paused
   * 가 실린다(검은 화면·켜진 채 표시 방지). 생략하면 false.
   */
  readonly paused?: boolean;
}

export interface ProducerEntry extends ProducerInfo {
  readonly id: string;
  /** 현재 일시정지(mute) 상태. produce 시 false 로 시작하고 toggle 로 갱신된다. */
  readonly paused: boolean;
}

export interface ConsumerInfo {
  readonly producerId: string;
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
}

export interface ConsumerEntry extends ConsumerInfo {
  readonly id: string;
}

export interface ParticipantMediaSnapshot {
  readonly participantId: string;
  readonly meetingCode: string;
  readonly routerIndex: number;
  readonly sendTransportId: string | null;
  readonly recvTransportId: string | null;
  readonly producers: ReadonlyArray<ProducerEntry>;
  readonly consumers: ReadonlyArray<ConsumerEntry>;
  readonly closed: boolean;
}

export interface SpawnParticipantMediaInput {
  participantId: string;
  meetingCode: string;
  routerIndex: number;
}

export class ParticipantMedia {
  private _sendTransportId: string | null = null;
  private _recvTransportId: string | null = null;
  private readonly _producers = new Map<string, ProducerEntry>();
  private readonly _consumers = new Map<string, ConsumerEntry>();
  private _closed = false;

  private constructor(
    public readonly participantId: string,
    public readonly meetingCode: string,
    public readonly routerIndex: number,
  ) {}

  static spawn(input: SpawnParticipantMediaInput): ParticipantMedia {
    const { participantId, meetingCode, routerIndex } = input;
    if (!participantId || participantId.trim() === '') {
      throw new Error('ParticipantMedia.participantId must be a non-empty string');
    }
    if (!meetingCode || meetingCode.trim() === '') {
      throw new Error('ParticipantMedia.meetingCode must be a non-empty string');
    }
    if (!Number.isInteger(routerIndex) || routerIndex < 0) {
      throw new Error(
        `ParticipantMedia.routerIndex must be a non-negative integer, got ${routerIndex}`,
      );
    }
    return new ParticipantMedia(participantId, meetingCode, routerIndex);
  }

  /**
   * snapshot 으로부터 ParticipantMedia 를 복원한다. Repository(Redis 등) 가
   * 영속 저장소에서 읽어들인 raw 상태를 그대로 도메인 객체로 되살린다.
   *
   * 입력 데이터는 신뢰 가능한 snapshot 이라는 trust 하에 형식 검증은 생략한다
   * (검증 책임은 snapshot 생성 시점에 있다).
   */
  static fromSnapshot(snapshot: ParticipantMediaSnapshot): ParticipantMedia {
    const pm = new ParticipantMedia(
      snapshot.participantId,
      snapshot.meetingCode,
      snapshot.routerIndex,
    );
    pm._sendTransportId = snapshot.sendTransportId;
    pm._recvTransportId = snapshot.recvTransportId;
    for (const p of snapshot.producers) {
      pm._producers.set(p.id, {
        id: p.id,
        kind: p.kind,
        source: p.source,
        paused: p.paused ?? false,
      });
    }
    for (const c of snapshot.consumers) {
      pm._consumers.set(c.id, {
        id: c.id,
        producerId: c.producerId,
        kind: c.kind,
        source: c.source,
      });
    }
    pm._closed = snapshot.closed;
    return pm;
  }

  get sendTransportId(): string | null {
    return this._sendTransportId;
  }
  get recvTransportId(): string | null {
    return this._recvTransportId;
  }
  get producers(): ProducerEntry[] {
    return Array.from(this._producers.values());
  }
  get consumers(): ConsumerEntry[] {
    return Array.from(this._consumers.values());
  }
  get isClosed(): boolean {
    return this._closed;
  }

  attachTransport(direction: TransportDirection, transportId: string): void {
    this.assertNotClosed();
    if (!transportId || transportId.trim() === '') {
      throw new Error('ParticipantMedia.transportId must be a non-empty string');
    }
    if (direction === 'send') {
      if (this._sendTransportId !== null) {
        throw new Error(
          `ParticipantMedia(${this.participantId}) already has a send transport`,
        );
      }
      this._sendTransportId = transportId;
      return;
    }
    if (this._recvTransportId !== null) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) already has a recv transport`,
      );
    }
    this._recvTransportId = transportId;
  }

  addProducer(id: string, info: ProducerInfo): void {
    this.assertNotClosed();
    if (this._sendTransportId === null) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) cannot add producer without send transport`,
      );
    }
    if (this._producers.has(id)) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) already has producer ${id}`,
      );
    }
    this._producers.set(id, {
      id,
      kind: info.kind,
      source: info.source,
      paused: info.paused ?? false,
    });
  }

  /**
   * producer 의 mute(paused) 상태를 갱신한다. 소유자가 자기 producer 를 toggle 할 때
   * application 서비스가 호출한다. 없는 producer 면 throw.
   */
  setProducerPaused(id: string, paused: boolean): void {
    this.assertNotClosed();
    const existing = this._producers.get(id);
    if (!existing) {
      throw new Error(`ParticipantMedia(${this.participantId}) has no producer ${id}`);
    }
    this._producers.set(id, { ...existing, paused });
  }

  removeProducer(id: string): void {
    this.assertNotClosed();
    if (!this._producers.has(id)) {
      throw new Error(`ParticipantMedia(${this.participantId}) has no producer ${id}`);
    }
    this._producers.delete(id);
  }

  addConsumer(id: string, info: ConsumerInfo): void {
    this.assertNotClosed();
    if (this._recvTransportId === null) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) cannot add consumer without recv transport`,
      );
    }
    if (this._consumers.has(id)) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) already has consumer ${id}`,
      );
    }
    this._consumers.set(id, {
      id,
      producerId: info.producerId,
      kind: info.kind,
      source: info.source,
    });
  }

  removeConsumer(id: string): void {
    this.assertNotClosed();
    if (!this._consumers.has(id)) {
      throw new Error(`ParticipantMedia(${this.participantId}) has no consumer ${id}`);
    }
    this._consumers.delete(id);
  }

  close(): void {
    if (this._closed) {
      throw new Error(`ParticipantMedia(${this.participantId}) already closed`);
    }
    this._closed = true;
  }

  snapshot(): ParticipantMediaSnapshot {
    return {
      participantId: this.participantId,
      meetingCode: this.meetingCode,
      routerIndex: this.routerIndex,
      sendTransportId: this._sendTransportId,
      recvTransportId: this._recvTransportId,
      producers: this.producers,
      consumers: this.consumers,
      closed: this._closed,
    };
  }

  private assertNotClosed(): void {
    if (this._closed) {
      throw new Error(`ParticipantMedia(${this.participantId}) is closed`);
    }
  }
}
