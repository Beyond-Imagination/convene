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
}

export interface ProducerEntry extends ProducerInfo {
  readonly id: string;
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
  static spawn(_input: SpawnParticipantMediaInput): ParticipantMedia {
    throw new Error('not implemented');
  }

  get participantId(): string {
    throw new Error('not implemented');
  }
  get meetingCode(): string {
    throw new Error('not implemented');
  }
  get routerIndex(): number {
    throw new Error('not implemented');
  }
  get sendTransportId(): string | null {
    throw new Error('not implemented');
  }
  get recvTransportId(): string | null {
    throw new Error('not implemented');
  }
  get producers(): ProducerEntry[] {
    throw new Error('not implemented');
  }
  get consumers(): ConsumerEntry[] {
    throw new Error('not implemented');
  }
  get isClosed(): boolean {
    throw new Error('not implemented');
  }

  attachTransport(_direction: TransportDirection, _transportId: string): void {
    throw new Error('not implemented');
  }
  addProducer(_id: string, _info: ProducerInfo): void {
    throw new Error('not implemented');
  }
  removeProducer(_id: string): void {
    throw new Error('not implemented');
  }
  addConsumer(_id: string, _info: ConsumerInfo): void {
    throw new Error('not implemented');
  }
  removeConsumer(_id: string): void {
    throw new Error('not implemented');
  }
  close(): void {
    throw new Error('not implemented');
  }
  snapshot(): ParticipantMediaSnapshot {
    throw new Error('not implemented');
  }
}
