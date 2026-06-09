import {
  ConsumeResponse,
  CreateTransportResponse,
  type ListProducersResponse,
  MEDIASOUP_EVENTS,
  MediaType,
  TransportDirection,
} from '@convene/shared-interfaces';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import {
  AudioCapturePort,
  MediaRouterPort,
  MediaTransportPort,
  ParticipantMediaRepository,
} from '@/mediasoup/domain/ports';
import { DomainEventPublisher } from '@/shared-kernel/domain/ports';

import { ParticipantMediaNotFoundError, ScreenShareConflictError } from './mediasoup.errors';

interface MediasoupSignalingServiceDeps {
  routerPort: MediaRouterPort;
  transportPort: MediaTransportPort;
  participantMediaRepository: ParticipantMediaRepository;
  audioCapture: AudioCapturePort;
  eventPublisher: DomainEventPublisher;
}

interface RoomCommand {
  meetingCode: string;
}

interface ParticipantCommand extends RoomCommand {
  participantId: string;
}

interface CreateTransportCommand extends ParticipantCommand {
  direction: TransportDirection;
}

interface ConnectTransportCommand extends ParticipantCommand {
  transportId: string;
  dtlsParameters: unknown;
}

interface ProduceCommand extends ParticipantCommand {
  transportId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  rtpParameters: unknown;
  paused?: boolean;
}

interface ConsumeCommand extends ParticipantCommand {
  transportId: string;
  producerId: string;
  rtpCapabilities: unknown;
}

interface ResumeConsumerCommand extends ParticipantCommand {
  consumerId: string;
}

interface ToggleProducerCommand extends ParticipantCommand {
  producerId: string;
  paused: boolean;
}

interface CloseProducerCommand extends ParticipantCommand {
  producerId: string;
}

/**
 * mediasoup 시그널링을 처리하는 서비스.
 *
 * Meeting BC의 도메인 이벤트에 반응해 회의 단위 라우터 풀과 참가자 단위 ParticipantMedia를 관리하고,
 * WebSocket 시그널링 RPC 진입점에서 호출되어 transport/producer/consumer lifecycle을 진행시키며 도메인 이벤트를 발행한다.
 */
export class MediasoupSignalingService {
  constructor(private readonly deps: MediasoupSignalingServiceDeps) {}

  // ---------- room lifecycle ----------

  async openRoom(command: RoomCommand): Promise<void> {
    await this.deps.routerPort.createRoom(command.meetingCode);
  }

  async closeRoom(command: RoomCommand): Promise<void> {
    // 회의 단위로 모든 audio capture 종료(stdin end → SIGTERM 대비).
    // 이후 router 정리 시 PlainTransport도 함께 close 되지만 stopAll이 명시적으로 ffmpeg subprocess까지 cleanup 한다.
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
    // audio capture가 진행 중이라면 먼저 정리한다. capture context가 없으면 no-op.
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
    // 화면 공유는 회의당 동시 1인.
    // 다른 참가자가 이미 screen producer를 갖고 있으면 거부한다(자기 자신 제외).
    // produce RPC는 순차 처리되고 frontend가 버튼을 disabled로 1차 차단한다.
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
      paused: command.paused,
    });
    media.addProducer(producerId, {
      kind: command.kind,
      source: command.source,
      paused: command.paused,
    });
    await this.deps.participantMediaRepository.save(media);

    // 다른 모든 router에 동일 producer가 보이도록 즉시 pipe. routersPerRoom <= 1이면 adapter가 no-op.
    await this.deps.routerPort.pipeProducerToAllRouters(
      command.meetingCode,
      producerId,
      media.routerIndex,
    );

    // audio producer만 STT 용으로 capture. video는 capture 대상이 아니다.
    // 같은 (meetingCode, participantId)에 대한 중복 호출은 어댑터가 dedup.
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
      paused: command.paused ?? false, // NEW_PRODUCER 브로드캐스트가 처음부터 mute 상태로 생성되도록 설정
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
    // 도메인에도 mute 상태를 반영·저장해, 늦게 입장한 참가자의 LIST_PRODUCERS 응답에 정확한 paused가 실리도록 한다(검은 화면 방지).
    media.setProducerPaused(command.producerId, command.paused);
    await this.deps.participantMediaRepository.save(media);
  }

  /**
   * 자기 producer를 닫는다(예: 화면 공유 중지).
   * 서버 측 producer/pipe를 정리하고 participantMedia에서도 제거해, 화면 공유 동시 1인 제약이 중지 후 정확히 풀리도록 한다.
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
    const peers = await this.deps.participantMediaRepository.findByMeetingCode(command.meetingCode);
    const producers: ListProducersResponse['producers'] = [];
    for (const peer of peers) {
      if (peer.participantId === command.participantId) continue;
      for (const producer of peer.producers) {
        producers.push({
          peerSocketId: peer.participantId,
          producerId: producer.id,
          kind: producer.kind,
          source: producer.source,
          paused: producer.paused,
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
