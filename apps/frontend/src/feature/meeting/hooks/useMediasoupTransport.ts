'use client';

import {
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
  type ProduceRequest,
  type ProduceResponse,
} from '@convene/shared-interfaces';
import type { Device, Transport } from 'mediasoup-client/types';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { rpcWithTimeout } from '@/shared/socket/mediasoup.rpc';
import { createMediasoupDevice } from '@/shared/socket/mediasoup-device.factory';

export type MediasoupConnectionStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface UseMediasoupTransport {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
  /** transport 밖(로컬 미디어 취득 등)에서 난 오류도 같은 창구로 모은다. */
  readonly reportError: (message: string) => void;
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
export function useMediasoupTransport(socket: Socket | null, code: string): UseMediasoupTransport {
  const [status, setStatus] = useState<MediasoupConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reconnectGen, setReconnectGen] = useState(0);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const connectCountRef = useRef(0);

  /**
   * socket의 'connect' 이벤트를 감시해 자동 재연결을 감지한다.
   * 두 번째 이상 'connect' = 재연결 → reconnectGen 증가 → main effect 재실행 →
   * 기존 transport.close + 새 transport 생성. 첫 'connect' 는 카운트만 올린다.
   */
  useEffect(() => {
    if (socket === null) return undefined;
    connectCountRef.current = 0;
    const onConnect = (): void => {
      connectCountRef.current += 1;
      if (connectCountRef.current > 1) {
        setReconnectGen((g) => g + 1);
      }
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [socket]);

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
    deviceRef,
    sendTransportRef,
    recvTransportRef,
  };
}
