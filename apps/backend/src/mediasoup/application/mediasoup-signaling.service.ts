import {
  ConsumeResponse,
  CreateTransportResponse,
  type ListProducersResponse,
  MEDIASOUP_EVENTS,
  MediaType,
  TransportDirection,
} from '@migration/shared-interfaces';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import {
  AudioCapturePort,
  MediaRouterPort,
  MediaTransportPort,
  ParticipantMediaRepository,
} from '@/mediasoup/domain/ports';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

import { ParticipantMediaNotFoundError, ScreenShareConflictError } from './mediasoup.errors';

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
  audioCapture: AudioCapturePort;
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

export interface ToggleProducerCommand extends ParticipantCommand {
  producerId: string;
  paused: boolean;
}

export interface CloseProducerCommand extends ParticipantCommand {
  producerId: string;
}

export class MediasoupSignalingService {
  constructor(private readonly deps: MediasoupSignalingServiceDeps) {}

  // ---------- room lifecycle ----------

  async openRoom(command: RoomCommand): Promise<void> {
    await this.deps.routerPort.createRoom(command.meetingCode);
  }

  async closeRoom(command: RoomCommand): Promise<void> {
    // 회의 단위로 모든 audio capture 종료(stdin end → SIGTERM 대비). 이후 router
    // 정리 시 PlainTransport 도 함께 close 되지만 stopAll 이 명시적으로 ffmpeg
    // subprocess 까지 cleanup 한다.
    await this.deps.audioCapture.stopAll(command.meetingCode);
    await this.deps.participantMediaRepository.removeAllByMeetingCode(command.meetingCode);
    await this.deps.routerPort.closeRoom(command.meetingCode);
  }

  // ---------- participant lifecycle ----------

  async admitParticipant(command: ParticipantCommand): Promise<ParticipantMedia> {
    const routerIndex = await this.deps.routerPort.assignParticipant(
      command.meetingCode,
      command.participantId,
    );
    const media = ParticipantMedia.spawn({
      participantId: command.participantId,
      meetingCode: command.meetingCode,
      routerIndex,
    });
    await this.deps.participantMediaRepository.save(media);
    return media;
  }

  async dismissParticipant(command: ParticipantCommand): Promise<void> {
    // audio capture 가 진행 중이라면 먼저 정리한다. capture context 가 없으면 no-op.
    await this.deps.audioCapture.stop(command.meetingCode, command.participantId);
    const existing = await this.deps.participantMediaRepository.findByParticipantId(
      command.participantId,
    );
    if (existing) {
      if (!existing.isClosed) existing.close();
      await this.deps.participantMediaRepository.removeByParticipantId(command.participantId);
    }
    await this.deps.routerPort.releaseParticipant(command.meetingCode, command.participantId);
  }

  // ---------- signaling RPC ----------

  async getRtpCapabilities(command: RoomCommand): Promise<unknown> {
    return this.deps.routerPort.getRtpCapabilities(command.meetingCode);
  }

  async createTransport(command: CreateTransportCommand): Promise<CreateTransportResponse> {
    const media = await this.requireParticipantMedia(command.participantId);
    const res = await this.deps.transportPort.createWebRtcTransport({
      meetingCode: command.meetingCode,
      participantId: command.participantId,
      direction: command.direction,
    });
    media.attachTransport(command.direction, res.id);
    await this.deps.participantMediaRepository.save(media);
    return res;
  }

  async connectTransport(command: ConnectTransportCommand): Promise<void> {
    await this.deps.transportPort.connectTransport(command.transportId, command.dtlsParameters);
  }

  async produce(command: ProduceCommand): Promise<{ producerId: string }> {
    const media = await this.requireParticipantMedia(command.participantId);
    // 화면 공유는 회의당 동시 1인. 다른 참가자가 이미 screen producer 를 갖고 있으면
    // 거부한다(자기 자신 제외). produce RPC 는 순차 처리되고 frontend 가 버튼을
    // disabled 로 1차 차단하므로, 본 체크가 사실상의 단일 공유 보장점이다.
    if (command.source === 'screen') {
      const peers = await this.deps.participantMediaRepository.findByMeetingCode(
        command.meetingCode,
      );
      const otherSharing = peers.some(
        (p) =>
          p.participantId !== command.participantId &&
          p.producers.some((pr) => pr.source === 'screen'),
      );
      if (otherSharing) {
        throw new ScreenShareConflictError(command.meetingCode);
      }
    }
    const { producerId } = await this.deps.transportPort.produce({
      meetingCode: command.meetingCode,
      participantId: command.participantId,
      transportId: command.transportId,
      kind: command.kind,
      source: command.source,
      rtpParameters: command.rtpParameters,
    });
    media.addProducer(producerId, { kind: command.kind, source: command.source });
    await this.deps.participantMediaRepository.save(media);

    // plum eager pipe — 다른 모든 router 에 동일 producer 가 보이도록 즉시 pipe.
    // routersPerRoom <= 1 이면 adapter 가 no-op.
    await this.deps.routerPort.pipeProducerToAllRouters(
      command.meetingCode,
      producerId,
      media.routerIndex,
    );

    // audio producer 만 STT 용으로 capture. video 는 capture 대상이 아니다.
    // 같은 (meetingCode, participantId) 에 대한 중복 호출은 어댑터가 dedup.
    if (command.kind === 'audio') {
      await this.deps.audioCapture.start({
        meetingCode: command.meetingCode,
        participantId: command.participantId,
        producerId,
      });
    }

    await this.deps.eventPublisher.publish(MEDIASOUP_EVENTS.PRODUCER_CREATED, {
      meetingCode: command.meetingCode,
      participantId: command.participantId,
      producerId,
      kind: command.kind,
      source: command.source,
    });
    return { producerId };
  }

  async consume(command: ConsumeCommand): Promise<ConsumeResponse> {
    const media = await this.requireParticipantMedia(command.participantId);
    const source = await this.lookupProducerSource(command.meetingCode, command.producerId);
    if (source === null) {
      throw new Error(
        `Producer "${command.producerId}" not found in meeting "${command.meetingCode}"`,
      );
    }
    const res = await this.deps.transportPort.consume({
      meetingCode: command.meetingCode,
      participantId: command.participantId,
      transportId: command.transportId,
      producerId: command.producerId,
      rtpCapabilities: command.rtpCapabilities,
    });
    media.addConsumer(res.id, { producerId: command.producerId, kind: res.kind, source });
    await this.deps.participantMediaRepository.save(media);
    return res;
  }

  async resumeConsumer(command: ResumeConsumerCommand): Promise<void> {
    await this.deps.transportPort.resumeConsumer(command.consumerId);
  }

  /**
   * 자기 producer 를 mute(paused:true)/unmute(paused:false) 한다.
   * 소유 검증: 호출자의 ParticipantMedia 에 없는 producerId 면 거부해
   * 남의 producer 를 toggle 하지 못하게 막는다(plum `toggle_media` 와 동등).
   */
  async toggleProducer(command: ToggleProducerCommand): Promise<void> {
    const media = await this.requireParticipantMedia(command.participantId);
    const owns = media.producers.some((p) => p.id === command.producerId);
    if (!owns) {
      throw new Error(
        `Producer "${command.producerId}" is not owned by participant "${command.participantId}"`,
      );
    }
    if (command.paused) {
      await this.deps.transportPort.pauseProducer(command.producerId);
    } else {
      await this.deps.transportPort.resumeProducer(command.producerId);
    }
  }

  /**
   * 자기 producer 를 닫는다(예: 화면 공유 중지). 서버 측 producer/pipe 를 정리하고
   * ParticipantMedia 에서도 제거해, 화면 공유 동시 1인 제약(produce 충돌 체크)이
   * 중지 후 정확히 풀리도록 한다. 소유하지 않은 producerId 는 거부한다.
   */
  async closeProducer(command: CloseProducerCommand): Promise<void> {
    const media = await this.requireParticipantMedia(command.participantId);
    const owns = media.producers.some((p) => p.id === command.producerId);
    if (!owns) {
      throw new Error(
        `Producer "${command.producerId}" is not owned by participant "${command.participantId}"`,
      );
    }
    await this.deps.transportPort.closeProducer(command.producerId);
    await this.deps.routerPort.cleanupPipeProducers(command.meetingCode, command.producerId);
    media.removeProducer(command.producerId);
    await this.deps.participantMediaRepository.save(media);
  }

  async listProducers(command: ParticipantCommand): Promise<ListProducersResponse> {
    const peers = await this.deps.participantMediaRepository.findByMeetingCode(
      command.meetingCode,
    );
    const producers: ListProducersResponse['producers'] = [];
    for (const peer of peers) {
      if (peer.participantId === command.participantId) continue;
      for (const producer of peer.producers) {
        producers.push({
          peerSocketId: peer.participantId,
          producerId: producer.id,
          kind: producer.kind,
          source: producer.source,
        });
      }
    }
    return { producers };
  }

  private async requireParticipantMedia(participantId: string): Promise<ParticipantMedia> {
    const media = await this.deps.participantMediaRepository.findByParticipantId(participantId);
    if (!media) {
      throw new ParticipantMediaNotFoundError(participantId);
    }
    return media;
  }

  private async lookupProducerSource(
    meetingCode: string,
    producerId: string,
  ): Promise<MediaType | null> {
    const peers = await this.deps.participantMediaRepository.findByMeetingCode(meetingCode);
    for (const peer of peers) {
      const producer = peer.producers.find((p) => p.id === producerId);
      if (producer) return producer.source;
    }
    return null;
  }
}
