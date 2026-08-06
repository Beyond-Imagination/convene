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
import { type MutableRefObject, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { MediasoupConnectionStatus } from '@/feature/meeting/hooks/useMediasoupTransport';
import { rpcWithTimeout } from '@/shared/socket/mediasoup.rpc';

export interface RemoteMediaEntry {
  readonly consumerId: string;
  readonly peerSocketId: string;
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
}: RemoteMediaDeps): UseRemoteMedia {
  const [remoteMedia, setRemoteMedia] = useState<RemoteMediaEntry[]>([]);

  useEffect(() => {
    if (status !== 'ready' || socket === null) return undefined;
    const recvTransport = recvTransportRef.current;
    const device = deviceRef.current;
    if (recvTransport === null || device === null) return undefined;
    let cancelled = false;

    const onNewProducer = (payload: NewProducerBroadcast): void => {
      void (async () => {
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
          if (cancelled) return;
          const consumer = await recvTransport.consume({
            id: consumeRes.id,
            producerId: consumeRes.producerId,
            kind: consumeRes.kind,
            rtpParameters: consumeRes.rtpParameters as never,
          });
          if (cancelled) return;
          const resumeRequest: ResumeConsumerRequest = {
            code,
            consumerId: consumeRes.id,
          };
          await rpcWithTimeout(socket, MEDIASOUP_WS_EVENTS.RESUME_CONSUMER, resumeRequest);
          if (cancelled) return;
          const entry: RemoteMediaEntry = {
            consumerId: consumeRes.id,
            peerSocketId: payload.peerSocketId,
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
          console.debug('[mediasoup] consume 성공', {
            consumerId: consumeRes.id,
            producerId: payload.producerId,
            source: payload.source,
          });
        } catch (err) {
          console.error('[mediasoup] consume 실패', err);
          // 한 개 consumer 실패는 전체 연결을 끊지 않는다.
        }
      })();
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
    // 참가자가 떠나면(정상 leave / 비정상 종료 모두 서버가 PARTICIPANT_LEFT 발행) 그 사람의 모든 remoteMedia를 제거한다.
    // 비정상 종료 시 producer 단위 PRODUCER_CLOSED가 오지 않으므로, 이 정리가 없으면 검은 타일이 잔존하고
    // 그가 화면 공유 중이었다면 isRemoteSharingScreen이 영영 true로 남는다.
    const onParticipantLeft = (payload: ParticipantLeftBroadcast): void => {
      setRemoteMedia((prev) => prev.filter((m) => m.peerSocketId !== payload.socketId));
    };

    socket.on(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, onNewProducer);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED, onProducerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED, onConsumerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED, onProducerToggled);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);

    // 늦게 입장한 클라이언트가 기존 producer 들을 받아오기 위해 한 번 조회.
    // NEW_PRODUCER 핸들러를 그대로 재사용해 동일한 consume 흐름을 탄다.
    void (async () => {
      try {
        const listReq: ListProducersRequest = { code };
        const res = await rpcWithTimeout<ListProducersResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
          listReq,
        );
        if (cancelled) return;
        console.debug('[mediasoup] listProducers 응답', {
          count: res.producers.length,
        });
        for (const p of res.producers) onNewProducer(p);
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
  }, [status, socket, code, deviceRef, recvTransportRef]);

  const isRemoteSharingScreen = remoteMedia.some((m) => m.source === 'screen');

  return { remoteMedia, isRemoteSharingScreen };
}
