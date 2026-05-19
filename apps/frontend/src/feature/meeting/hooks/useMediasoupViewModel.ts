'use client';

import type { Device, Transport } from 'mediasoup-client/lib/types';
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  MEDIASOUP_WS_EVENTS,
} from '@migration/shared-interfaces';

import { createMediasoupDevice } from '@/shared/socket/mediasoup-device.factory';

/**
 * Mediasoup 클라이언트 ViewModel.
 *
 * 회의 페이지 mount 시점에 다음 RPC sequence 를 한 번 수행한다:
 *   1. `mediasoup:getRtpCapabilities` → device.load
 *   2. `mediasoup:createTransport(send)` → sendTransport
 *   3. `mediasoup:createTransport(recv)` → recvTransport
 *
 * 각 transport 의 `connect` 이벤트를 받아 backend `connectTransport` RPC 로
 * 위임한다. produce(local stream) / consume(remote) 흐름은 후속 단계에서
 * 본 hook 의 transport ref 위에 쌓는다.
 *
 * unmount 시 transport.close() 로 정리.
 */

export type MediasoupConnectionStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface UseMediasoupViewModel {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
}

export function useMediasoupViewModel(
  socket: Socket | null,
  code: string,
): UseMediasoupViewModel {
  const [status, setStatus] = useState<MediasoupConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);

  useEffect(() => {
    if (socket === null) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        setStatus('preparing');
        const caps = (await socket.emitWithAck(
          MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES,
          { code },
        )) as GetRtpCapabilitiesResponse;
        if (cancelled) return;
        const device = await createMediasoupDevice();
        await device.load({
          routerRtpCapabilities: caps.rtpCapabilities as never,
        });
        if (cancelled) return;
        deviceRef.current = device;

        const sendOpts = (await socket.emitWithAck(
          MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
          { code, direction: 'send' as const },
        )) as CreateTransportResponse;
        if (cancelled) return;
        const sendTransport = device.createSendTransport(sendOpts as never);
        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket
            .emitWithAck(MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT, {
              code,
              transportId: sendOpts.id,
              dtlsParameters,
            })
            .then(() => callback())
            .catch(errback);
        });
        sendTransportRef.current = sendTransport;

        const recvOpts = (await socket.emitWithAck(
          MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
          { code, direction: 'recv' as const },
        )) as CreateTransportResponse;
        if (cancelled) return;
        const recvTransport = device.createRecvTransport(recvOpts as never);
        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket
            .emitWithAck(MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT, {
              code,
              transportId: recvOpts.id,
              dtlsParameters,
            })
            .then(() => callback())
            .catch(errback);
        });
        recvTransportRef.current = recvTransport;

        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
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
    };
  }, [socket, code]);

  return { status, errorMessage };
}
