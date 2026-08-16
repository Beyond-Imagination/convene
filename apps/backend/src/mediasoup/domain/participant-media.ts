import { MediaType, TransportDirection } from '@convene/shared-interfaces';

/**
 * 한 회의에 참여한 **한 명의 미디어 상태**를 표현한다.
 *
 * - identity는 `participantId`(Meeting BC의 `Participant.id`와 동일한 안정 식별자. 재연결로 socket이 바뀌어도 유지된다).
 * - `meetingCode`는 그룹 키로, Mediasoup BC의 application 서비스가 같은 회의의 다른 ParticipantMedia들을 묶어 브로드캐스트 대상을 결정한다.
 * - `routerIndex`는 multi-router 전략에서 infrastructure의 `MediaRouterPort`가 할당해 준 라우터 인덱스. 도메인은 값을 신뢰하고 검증·재할당하지 않는다.
 */

interface ProducerInfo {
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
  readonly paused?: boolean;
}

interface ProducerEntry extends ProducerInfo {
  readonly id: string;
  readonly paused: boolean;
}

interface ConsumerInfo {
  readonly producerId: string;
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
}

interface ConsumerEntry extends ConsumerInfo {
  readonly id: string;
}

/** 재생성을 위해 놓아 준 transport와, 그 위에 얹혀 있어 함께 정리돼야 할 미디어. */
export interface ReleasedTransport {
  readonly transportId: string;
  readonly producerIds: ReadonlyArray<string>;
  readonly consumerIds: ReadonlyArray<string>;
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

interface SpawnParticipantMediaInput {
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
   * snapshot으로부터 ParticipantMedia를 복원한다. Repository가 영속 저장소에서 읽어들인 raw 상태를 그대로 도메인 객체로 되살린다.
   * 입력 데이터는 신뢰 가능한 snapshot이라는 trust 하에 형식 검증은 생략한다(검증 책임은 snapshot 생성 시점에 있다).
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

  ownsTransport(transportId: string): boolean {
    return this._sendTransportId === transportId || this._recvTransportId === transportId;
  }

  attachTransport(direction: TransportDirection, transportId: string): void {
    this.assertNotClosed();
    if (!transportId || transportId.trim() === '') {
      throw new Error('ParticipantMedia.transportId must be a non-empty string');
    }
    if (direction === 'send') {
      if (this._sendTransportId !== null) {
        throw new Error(`ParticipantMedia(${this.participantId}) already has a send transport`);
      }
      this._sendTransportId = transportId;
      return;
    }
    if (this._recvTransportId !== null) {
      throw new Error(`ParticipantMedia(${this.participantId}) already has a recv transport`);
    }
    this._recvTransportId = transportId;
  }

  /**
   * 재연결로 transport를 다시 만들 때 이전 것을 놓아 준다. producer는 send에, consumer는 recv에
   * 얹혀 있으므로 해당 방향의 것만 함께 비운다 — transport를 닫으면 그것들도 같이 죽는다.
   */
  releaseTransport(direction: TransportDirection): ReleasedTransport | null {
    this.assertNotClosed();
    const transportId = direction === 'send' ? this._sendTransportId : this._recvTransportId;
    if (transportId === null) return null;
    const producerIds = direction === 'send' ? this.producers.map((p) => p.id) : [];
    const consumerIds = direction === 'recv' ? this.consumers.map((c) => c.id) : [];
    if (direction === 'send') {
      this._sendTransportId = null;
      this._producers.clear();
    } else {
      this._recvTransportId = null;
      this._consumers.clear();
    }
    return { transportId, producerIds, consumerIds };
  }

  addProducer(id: string, info: ProducerInfo): void {
    this.assertNotClosed();
    if (this._sendTransportId === null) {
      throw new Error(
        `ParticipantMedia(${this.participantId}) cannot add producer without send transport`,
      );
    }
    if (this._producers.has(id)) {
      throw new Error(`ParticipantMedia(${this.participantId}) already has producer ${id}`);
    }
    this._producers.set(id, {
      id,
      kind: info.kind,
      source: info.source,
      paused: info.paused ?? false,
    });
  }

  /**
   * producer의 mute 상태를 갱신한다. 소유자가 자기 producer를 toggle할 때 application 서비스가 호출한다.
   * 없는 producer면 throw.
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
      throw new Error(`ParticipantMedia(${this.participantId}) already has consumer ${id}`);
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
