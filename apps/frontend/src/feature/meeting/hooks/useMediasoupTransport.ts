'use client';

import {
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
  type ProduceRequest,
  type ProduceResponse,
  type RestartIceResponse,
} from '@convene/shared-interfaces';
import type { Device, Transport } from 'mediasoup-client/types';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { rpcWithTimeout } from '@/shared/socket/mediasoup.rpc';

const RESTART_ICE_TIMEOUT_MS = 2_000;
import { createMediasoupDevice } from '@/shared/socket/mediasoup-device.factory';

export type MediasoupConnectionStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface UseMediasoupTransport {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
  /** transport 밖(로컬 미디어 취득 등)에서 난 오류도 같은 창구로 모은다. */
  readonly reportError: (message: string) => void;
  /** transport를 재생성하지 않고 복귀한 횟수. `useRemoteMedia`가 재구축 대신 재동기화를 돈다. */
  readonly resumeGen: number;
  readonly deviceRef: MutableRefObject<Device | null>;
  readonly sendTransportRef: MutableRefObject<Transport | null>;
  readonly recvTransportRef: MutableRefObject<Transport | null>;
}

/**
 * mediasoup 연결 lifecycle — device + send/recv transport 준비까지만 책임진다.
 *
 * mount(및 재연결) 시점에 다음 RPC sequence를 수행한다:
 *   1. `mediasoup:getRtpCapabilities` → device.load
 *   2. `mediasoup:createTransport(send)` → sendTransport
 *   3. `mediasoup:createTransport(recv)` → recvTransport
 *
 * 각 transport의 `connect` 이벤트를 받아 backend `connectTransport` RPC로 위임한다.
 * 준비가 끝나면 status='ready'가 되고, 그 위에 쌓이는 produce/consume은
 * `useLocalMedia`·`useRemoteMedia`가 여기서 받은 ref로 처리한다.
 */
export function useMediasoupTransport(
  socket: Socket | null,
  code: string,
  rejoinGen: number,
  /** 서버가 내 미디어를 유예 동안 살려 뒀는지. false면 재사용할 것이 없다. */
  mediaPreserved: boolean,
): UseMediasoupTransport {
  const [status, setStatus] = useState<MediasoupConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reconnectGen, setReconnectGen] = useState(0);
  const [resumeGen, setResumeGen] = useState(0);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);

  /**
   * WebRTC transport는 시그널링 소켓과 독립이라, 소켓이 끊겼다고 미디어가 끊긴 것은 아니다.
   * connected면 재동기화만, 끊겼으면 ICE만 재협상, 그마저 실패하면 전면 재생성.
   */
  const recover = useCallback(async (): Promise<void> => {
    if (socket === null) return;
    if (!mediaPreserved) {
      setReconnectGen((g) => g + 1);
      return;
    }
    const transports = [sendTransportRef.current, recvTransportRef.current];
    if (transports.some((t) => t === null || t.closed)) {
      setReconnectGen((g) => g + 1);
      return;
    }
    const broken = (transports as Transport[]).filter((t) => t.connectionState !== 'connected');
    if (broken.length === 0) {
      setResumeGen((g) => g + 1);
      return;
    }
    try {
      for (const transport of broken) {
        const res = await rpcWithTimeout<RestartIceResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.RESTART_ICE,
          { code, transportId: transport.id },
          // 서버 로컬 연산이라 즉답이 정상이다. 실패는 ack 없이 오므로,
          // 기본 타임아웃을 쓰면 전면 재생성으로 내려가기까지 10초를 버린다.
          RESTART_ICE_TIMEOUT_MS,
        );
        await transport.restartIce({ iceParameters: res.iceParameters as never });
      }
      setResumeGen((g) => g + 1);
    } catch (err) {
      console.warn('[mediasoup] ICE restart 실패 — 전면 재생성으로 내려간다', err);
      setReconnectGen((g) => g + 1);
    }
  }, [socket, code, mediaPreserved]);

  // 소켓 'connect'가 아니라 재입장 ack을 기다린다. 그 전에 RPC를 보내면 서버가 이 소켓의
  // 신원을 몰라 socket.id로 대체하고, 그 ID의 미디어는 없으므로 요청이 통째로 실패한다.
  useEffect(() => {
    if (rejoinGen === 0) return;
    void recover();
  }, [rejoinGen, recover]);

  useEffect(() => {
    if (socket === null) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        setStatus('preparing');
        const caps = await rpcWithTimeout<GetRtpCapabilitiesResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES,
          { code },
        );
        if (cancelled) return;
        const device = await createMediasoupDevice();
        await device.load({
          routerRtpCapabilities: caps.rtpCapabilities as never,
        });
        if (cancelled) return;
        deviceRef.current = device;

        const sendOpts = await rpcWithTimeout<CreateTransportResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
          { code, direction: 'send' as const },
        );
        if (cancelled) return;
        const sendTransport = device.createSendTransport(sendOpts as never);
        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          rpcWithTimeout(socket, MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT, {
            code,
            transportId: sendOpts.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch((err) => {
              console.error('[mediasoup] sendTransport connect 실패', err);
              errback(err instanceof Error ? err : new Error(String(err)));
            });
        });
        sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
          const ad = appData as { source?: MediaType; paused?: boolean } | undefined;
          const source = ad?.source ?? (kind as MediaType);
          const request: ProduceRequest = {
            code,
            transportId: sendOpts.id,
            kind: kind as 'audio' | 'video',
            source,
            rtpParameters,
            // 기본 OFF 입장은 appData.paused로 의도를 싣는다 → 서버가 paused producer
            // 생성 + NEW_PRODUCER에 paused 전파(produce 후 별도 TOGGLE race 제거).
            paused: ad?.paused ?? false,
          };
          rpcWithTimeout<ProduceResponse>(socket, MEDIASOUP_WS_EVENTS.PRODUCE, request)
            .then((res) => callback({ id: res.producerId }))
            .catch((err) => {
              console.error('[mediasoup] produce 실패', err);
              errback(err instanceof Error ? err : new Error(String(err)));
            });
        });
        sendTransportRef.current = sendTransport;

        const recvOpts = await rpcWithTimeout<CreateTransportResponse>(
          socket,
          MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
          { code, direction: 'recv' as const },
        );
        if (cancelled) return;
        const recvTransport = device.createRecvTransport(recvOpts as never);
        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          rpcWithTimeout(socket, MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT, {
            code,
            transportId: recvOpts.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch((err) => {
              console.error('[mediasoup] recvTransport connect 실패', err);
              errback(err instanceof Error ? err : new Error(String(err)));
            });
        });
        recvTransportRef.current = recvTransport;

        setStatus('ready');
        console.debug('[mediasoup] ready — transports 준비 완료', {
          sendId: sendOpts.id,
          recvId: recvOpts.id,
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error('[mediasoup] setup 실패', message);
        setErrorMessage(message);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;
      // 여기서 status를 되돌리지 않는다. effect body가 즉시 'preparing'으로 올리고,
      // 그 전이를 보고 useLocalMedia/useRemoteMedia가 각자의 stale 미디어를 비운다.
    };
  }, [socket, code, reconnectGen]);

  const reportError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  return {
    status,
    errorMessage,
    reportError,
    resumeGen,
    deviceRef,
    sendTransportRef,
    recvTransportRef,
  };
}
