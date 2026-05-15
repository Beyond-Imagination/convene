import {
  ConsumeResponse,
  CreateTransportResponse,
  MediaType,
  TransportDirection,
} from '@migration/shared-interfaces';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import {
  MediaRouterPort,
  MediaTransportPort,
  ParticipantMediaRepository,
} from '@/mediasoup/domain/ports';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

/**
 * Mediasoup Bounded Context 의 Application Service.
 *
 * Meeting BC 의 도메인 이벤트(`meeting.created` / `participant.joined` / ...)에
 * 반응해 회의 단위 라우터 풀과 참가자 단위 ParticipantMedia 를 관리하고,
 * WebSocket 시그널링 RPC(`mediasoup:*`) 진입점에서 호출되어 transport/producer/
 * consumer lifecycle 을 진행시킨다.
 *
 * 도메인 이벤트는 본 layer 에서 발행한다 (ARCHITECTURE.md §3).
 */

export interface MediasoupSignalingServiceDeps {
  routerPort: MediaRouterPort;
  transportPort: MediaTransportPort;
  participantMediaRepository: ParticipantMediaRepository;
  eventPublisher: DomainEventPublisher;
}

export interface RoomCommand {
  meetingCode: string;
}

export interface ParticipantCommand extends RoomCommand {
  participantId: string;
}

export interface CreateTransportCommand extends ParticipantCommand {
  direction: TransportDirection;
}

export interface ConnectTransportCommand extends ParticipantCommand {
  transportId: string;
  dtlsParameters: unknown;
}

export interface ProduceCommand extends ParticipantCommand {
  transportId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  rtpParameters: unknown;
}

export interface ConsumeCommand extends ParticipantCommand {
  transportId: string;
  producerId: string;
  rtpCapabilities: unknown;
}

export interface ResumeConsumerCommand extends ParticipantCommand {
  consumerId: string;
}

export class MediasoupSignalingService {
  constructor(private readonly _deps: MediasoupSignalingServiceDeps) {}

  // ---------- room lifecycle ----------

  async openRoom(_cmd: RoomCommand): Promise<void> {
    throw new Error('not implemented');
  }

  async closeRoom(_cmd: RoomCommand): Promise<void> {
    throw new Error('not implemented');
  }

  // ---------- participant lifecycle ----------

  async admitParticipant(_cmd: ParticipantCommand): Promise<ParticipantMedia> {
    throw new Error('not implemented');
  }

  async dismissParticipant(_cmd: ParticipantCommand): Promise<void> {
    throw new Error('not implemented');
  }

  // ---------- signaling RPC ----------

  async getRtpCapabilities(_cmd: RoomCommand): Promise<unknown> {
    throw new Error('not implemented');
  }

  async createTransport(_cmd: CreateTransportCommand): Promise<CreateTransportResponse> {
    throw new Error('not implemented');
  }

  async connectTransport(_cmd: ConnectTransportCommand): Promise<void> {
    throw new Error('not implemented');
  }

  async produce(_cmd: ProduceCommand): Promise<{ producerId: string }> {
    throw new Error('not implemented');
  }

  async consume(_cmd: ConsumeCommand): Promise<ConsumeResponse> {
    throw new Error('not implemented');
  }

  async resumeConsumer(_cmd: ResumeConsumerCommand): Promise<void> {
    throw new Error('not implemented');
  }
}
