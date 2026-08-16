'use client';

import {
  type ConsumerClosedBroadcast,
  type ConsumeRequest,
  type ConsumeResponse,
  type ListProducersRequest,
  type ListProducersResponse,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
  MEETING_WS_EVENTS,
  type NewProducerBroadcast,
  type ParticipantLeftBroadcast,
  type ProducerClosedBroadcast,
  type ProducerToggledBroadcast,
  type ResumeConsumerRequest,
} from '@convene/shared-interfaces';
import type { Device, Transport } from 'mediasoup-client/types';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { MediasoupConnectionStatus } from '@/feature/meeting/hooks/useMediasoupTransport';
import { rpcWithTimeout } from '@/shared/socket/mediasoup.rpc';

export interface RemoteMediaEntry {
  readonly consumerId: string;
  readonly peerId: string;
  readonly producerId: string;
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
  readonly track: MediaStreamTrack;
  readonly paused: boolean;
}

export interface RemoteMediaDeps {
  readonly socket: Socket | null;
  readonly code: string;
  readonly status: MediasoupConnectionStatus;
  readonly deviceRef: MutableRefObject<Device | null>;
  readonly recvTransportRef: MutableRefObject<Transport | null>;
  /** 증가하면 기존 consumer를 유지한 채 끊긴 동안의 producer 변화만 따라잡는다. */
  readonly resumeGen: number;
}

export interface UseRemoteMedia {
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
  /**
   * 같은 회의의 다른 참가자가 화면을 공유 중인지. 화면 공유는 동시 1인 제약이라 true 면 View가 "화면 공유 시작" 버튼을 disabled 한다.
   */
  readonly isRemoteSharingScreen: boolean;
}

/**
 * 다른 참가자의 미디어 수신 — status='ready' 도달 후 NEW_PRODUCER 브로드캐스트를 구독한다.
 * 같은 회의의 다른 참가자가 producer를 만들 때마다:
 *   1) CONSUME RPC로 consumer 정보 요청
 *   2) recvTransport.consume으로 client 측 Consumer 생성
 *   3) RESUME_CONSUMER RPC (backend는 paused로 시작)
 *   4) remoteMedia state에 entry 추가
 */
export function useRemoteMedia({
  socket,
  code,
  status,
  deviceRef,
  recvTransportRef,
  resumeGen,
}: RemoteMediaDeps): UseRemoteMedia {
  const [remoteMedia, setRemoteMedia] = useState<RemoteMediaEntry[]>([]);
  // 재동기화가 "이미 아는 producer"를 판단할 때 쓴다. state를 의존성에 넣으면 매 갱신마다 재동기화가 돈다.
  const remoteMediaRef = useRef(remoteMedia);
  remoteMediaRef.current = remoteMedia;

  const consume = useCallback(
    async (payload: NewProducerBroadcast): Promise<void> => {
      const recvTransport = recvTransportRef.current;
      const device = deviceRef.current;
      if (socket === null || recvTransport === null || device === null) return;
      try {
        console.debug('[mediasoup] consume 시작', payload);
        const consumeRequest: ConsumeRequest = {
          code,
          transportId: recvTransport.id,
          producerId: payload.producerId,
          rtpCapabilities: device.recvRtpCapabilities as unknown,
        };
        const consumeRes = await rpcWithTimeout<ConsumeResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.CONSUME,
          consumeRequest,
        );
        const consumer = await recvTransport.consume({
          id: consumeRes.id,
          producerId: consumeRes.producerId,
          kind: consumeRes.kind,
          rtpParameters: consumeRes.rtpParameters as never,
        });
        const resumeRequest: ResumeConsumerRequest = { code, consumerId: consumeRes.id };
        await rpcWithTimeout(socket, MEDIASOUP_WS_EVENTS.RESUME_CONSUMER, resumeRequest);
        const entry: RemoteMediaEntry = {
          consumerId: consumeRes.id,
          peerId: payload.peerId,
          producerId: payload.producerId,
          kind: payload.kind,
          source: payload.source,
          track: (consumer as unknown as { track: MediaStreamTrack }).track,
          // 기존 producer가 이미 mute 상태일 수 있으므로 broadcast의 paused를 반영한다.
          paused: payload.paused ?? false,
        };
        // producerId 기준 dedup (LIST_PRODUCERS 응답과 NEW_PRODUCER broadcast가 동일 producer를 두 번 통보할 수 있다)
        setRemoteMedia((prev) => {
          if (prev.some((m) => m.producerId === entry.producerId)) return prev;
          return [...prev, entry];
        });
      } catch (err) {
        console.error('[mediasoup] consume 실패', err);
        // 한 개 consumer 실패는 전체 연결을 끊지 않는다.
      }
    },
    [socket, code, deviceRef, recvTransportRef],
  );

  useEffect(() => {
    if (status !== 'ready' || socket === null) return undefined;
    const recvTransport = recvTransportRef.current;
    const device = deviceRef.current;
    if (recvTransport === null || device === null) return undefined;
    let cancelled = false;

    const onNewProducer = (payload: NewProducerBroadcast): void => {
      if (cancelled) return;
      void consume(payload);
    };
    const onProducerClosed = (payload: ProducerClosedBroadcast): void => {
      setRemoteMedia((prev) => prev.filter((m) => m.producerId !== payload.producerId));
    };
    const onConsumerClosed = (payload: ConsumerClosedBroadcast): void => {
      setRemoteMedia((prev) => prev.filter((m) => m.consumerId !== payload.consumerId));
    };
    const onProducerToggled = (payload: ProducerToggledBroadcast): void => {
      setRemoteMedia((prev) =>
        prev.map((m) =>
          m.producerId === payload.producerId ? { ...m, paused: payload.paused } : m,
        ),
      );
    };
    // 연결만 끊긴 경우는 서버가 미디어를 살려 두므로 여기서 지우지 않는다(DISCONNECTED로 따로 온다).
    const onParticipantLeft = (payload: ParticipantLeftBroadcast): void => {
      setRemoteMedia((prev) => prev.filter((m) => m.peerId !== payload.participantId));
    };

    socket.on(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, onNewProducer);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED, onProducerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED, onConsumerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED, onProducerToggled);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);

    // 늦게 입장한 클라이언트가 기존 producer 들을 받아오기 위해 한 번 조회.
    void (async () => {
      try {
        const listReq: ListProducersRequest = { code };
        const res = await rpcWithTimeout<ListProducersResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
          listReq,
        );
        if (cancelled) return;
        for (const p of res.producers) void consume(p);
      } catch (err) {
        console.error('[mediasoup] listProducers 실패', err);
      }
    })();

    return () => {
      cancelled = true;
      socket.off(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, onNewProducer);
      socket.off(MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED, onProducerClosed);
      socket.off(MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED, onConsumerClosed);
      socket.off(MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED, onProducerToggled);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
      // 재연결/unmount 시 stale 원격 트랙을 비운다.
      setRemoteMedia([]);
    };
  }, [status, socket, code, deviceRef, recvTransportRef, consume]);

  // 기존 consumer는 그대로 유효하다. 전체를 다시 만들면 서버에 consumer가 중복으로 쌓인다.
  useEffect(() => {
    if (resumeGen === 0 || status !== 'ready' || socket === null) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const res = await rpcWithTimeout<ListProducersResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
          { code } satisfies ListProducersRequest,
        );
        if (cancelled) return;
        const live = new Set(res.producers.map((p) => p.producerId));
        setRemoteMedia((prev) => prev.filter((m) => live.has(m.producerId)));
        const known = new Set(remoteMediaRef.current.map((m) => m.producerId));
        for (const p of res.producers) {
          if (!known.has(p.producerId)) void consume(p);
        }
      } catch (err) {
        console.error('[mediasoup] 재동기화 실패', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeGen, status, socket, code, consume]);

  const isRemoteSharingScreen = remoteMedia.some((m) => m.source === 'screen');

  return { remoteMedia, isRemoteSharingScreen };
}
