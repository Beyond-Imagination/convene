'use client';

import type { Device, Producer, Transport } from 'mediasoup-client/lib/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type ConsumeRequest,
  type ConsumeResponse,
  type ConsumerClosedBroadcast,
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  type ListProducersRequest,
  type ListProducersResponse,
  type MediaType,
  MEDIASOUP_WS_EVENTS,
  type NewProducerBroadcast,
  type ProduceRequest,
  type ProduceResponse,
  type ProducerClosedBroadcast,
  type CloseProducerRequest,
  type ProducerToggledBroadcast,
  type ResumeConsumerRequest,
  type ToggleProducerRequest,
} from '@migration/shared-interfaces';

import { createMediasoupDevice } from '@/shared/socket/mediasoup-device.factory';

/**
 * mediasoup signaling RPC 타임아웃. backend handler 가 throw 하면 NestJS WS 가 ACK
 * callback 을 호출하지 않아 socket.io 의 emitWithAck 가 영원히 대기한다(transport.
 * connect → 'connect' callback 미호출 → produce 영원 대기). 명시 timeout 으로
 * 무한 hang 회피 + mediasoup-client transport 의 errback 트리거.
 */
const RPC_TIMEOUT_MS = 10_000;

const rpcWithTimeout = async <T>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`mediasoup RPC '${event}' timeout after ${RPC_TIMEOUT_MS}ms`),
        ),
      RPC_TIMEOUT_MS,
    );
    socket.emitWithAck(event, payload).then(
      (res) => {
        clearTimeout(timer);
        resolve(res as T);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
};

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

export interface RemoteMediaEntry {
  readonly consumerId: string;
  readonly peerSocketId: string;
  readonly producerId: string;
  readonly kind: 'audio' | 'video';
  readonly source: MediaType;
  readonly track: MediaStreamTrack;
  /** 상대가 이 producer 를 mute(paused) 했는지. 원격 PRODUCER_TOGGLED 로 갱신. */
  readonly paused: boolean;
}

export interface UseMediasoupViewModel {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
  readonly localStream: MediaStream | null;
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
  readonly isSharingScreen: boolean;
  readonly screenStream: MediaStream | null;
  /**
   * 같은 회의의 다른 참가자가 화면을 공유 중인지. 화면 공유는 동시 1인 제약이라
   * true 면 View 가 "화면 공유 시작" 버튼을 disabled 한다(backend 도 produce 를
   * 거부하지만 UX 상 1차 차단).
   */
  readonly isRemoteSharingScreen: boolean;
  /** 내 마이크가 mute(paused) 상태인지. */
  readonly isAudioMuted: boolean;
  /** 내 카메라가 mute(paused) 상태인지. */
  readonly isVideoMuted: boolean;
  /** 내 audio producer 를 mute/unmute 토글. local pause/resume + TOGGLE_PRODUCER RPC. */
  readonly toggleAudio: () => void;
  /** 내 video producer 를 mute/unmute 토글. */
  readonly toggleVideo: () => void;
  /**
   * 사용자의 화면을 mediasoup 으로 produce 한다. getDisplayMedia 권한 거부나
   * 이미 공유 중인 경우 noop. produce 이벤트는 sendTransport 의 'produce' 핸들러
   * 가 PRODUCE RPC(source='screen') 로 위임한다.
   */
  readonly startScreenShare: () => Promise<void>;
  readonly stopScreenShare: () => void;
}

export function useMediasoupViewModel(
  socket: Socket | null,
  code: string,
): UseMediasoupViewModel {
  const [status, setStatus] = useState<MediasoupConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMediaEntry[]>([]);
  const [reconnectGen, setReconnectGen] = useState(0);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenProducerRef = useRef<Producer | null>(null);
  const connectCountRef = useRef(0);

  /**
   * socket 의 'connect' 이벤트를 감시해 자동 재연결을 감지한다.
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
        sendTransport.on(
          'produce',
          ({ kind, rtpParameters, appData }, callback, errback) => {
            const source =
              (appData as { source?: MediaType } | undefined)?.source ??
              (kind as MediaType);
            const request: ProduceRequest = {
              code,
              transportId: sendOpts.id,
              kind: kind as 'audio' | 'video',
              source,
              rtpParameters,
            };
            rpcWithTimeout<ProduceResponse>(
              socket,
              MEDIASOUP_WS_EVENTS.PRODUCE,
              request,
            )
              .then((res) => callback({ id: res.producerId }))
              .catch((err) => {
                console.error('[mediasoup] produce 실패', err);
                errback(err instanceof Error ? err : new Error(String(err)));
              });
          },
        );
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
      // 재연결 / unmount 시 stale 미디어를 비운다. localStream 은 [status] effect
      // 의 cleanup 에서 stop 된다(status 가 'ready'→'preparing' 으로 바뀌면서).
      setRemoteMedia([]);
    };
  }, [socket, code, reconnectGen]);

  /**
   * status='ready' 도달 후 별도 effect 에서 local 미디어를 produce 한다.
   * 1) navigator.mediaDevices.getUserMedia({audio, video})
   * 2) audio/video track 각각 sendTransport.produce → 'produce' 이벤트가
   *    PRODUCE RPC 로 위임됨(상단 effect 에서 핸들러 등록).
   * cleanup 에서 local track 들을 stop 해 카메라/마이크를 해제한다.
   */
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const sendTransport = sendTransportRef.current;
    if (sendTransport === null) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        console.debug('[mediasoup] getUserMedia 시작');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        console.debug('[mediasoup] getUserMedia 성공', {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        for (const track of stream.getAudioTracks()) {
          console.debug('[mediasoup] audio produce 시작', { trackId: track.id });
          const producer = await sendTransport.produce({
            track: track as never,
            appData: { source: 'audio' as MediaType },
          });
          console.debug('[mediasoup] audio produce 성공', { producerId: producer.id });
          audioProducerRef.current = producer;
          if (cancelled) return;
        }
        for (const track of stream.getVideoTracks()) {
          console.debug('[mediasoup] video produce 시작', { trackId: track.id });
          const producer = await sendTransport.produce({
            track: track as never,
            appData: { source: 'video' as MediaType },
          });
          console.debug('[mediasoup] video produce 성공', { producerId: producer.id });
          videoProducerRef.current = producer;
          if (cancelled) return;
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error('[mediasoup] local produce 실패', message);
        setErrorMessage(message);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      // 재연결/unmount 시 producer ref + mute 상태를 초기화한다(새 producer 로 교체됨).
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      setIsAudioMuted(false);
      setIsVideoMuted(false);
    };
  }, [status]);

  /**
   * status='ready' 도달 후 NEW_PRODUCER 브로드캐스트 구독.
   * 같은 회의의 다른 참가자가 producer 를 만들 때마다:
   *   1) CONSUME RPC 로 consumer 정보 요청
   *   2) recvTransport.consume 으로 client 측 Consumer 생성
   *   3) RESUME_CONSUMER RPC (backend 는 paused 로 시작)
   *   4) remoteMedia state 에 entry 추가
   */
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
            rtpCapabilities: device.rtpCapabilities as unknown,
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
          await rpcWithTimeout(
            socket,
            MEDIASOUP_WS_EVENTS.RESUME_CONSUMER,
            resumeRequest,
          );
          if (cancelled) return;
          const entry: RemoteMediaEntry = {
            consumerId: consumeRes.id,
            peerSocketId: payload.peerSocketId,
            producerId: payload.producerId,
            kind: payload.kind,
            source: payload.source,
            track: (consumer as unknown as { track: MediaStreamTrack }).track,
            paused: false,
          };
          // producerId 기준 dedup (LIST_PRODUCERS 응답과 NEW_PRODUCER broadcast 가
          // 동일 producer 를 두 번 통보할 수 있다 — [[feedback-mediasoup-no-race]] #2)
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

    socket.on(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, onNewProducer);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED, onProducerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED, onConsumerClosed);
    socket.on(MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED, onProducerToggled);

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
    };
  }, [status, socket, code]);

  /**
   * 로컬 producer 를 mute/unmute 토글한다. mediasoup-client producer.pause()/resume()
   * 로 RTP 송출을 멈추고, 같은 의도를 backend 에 TOGGLE_PRODUCER RPC 로 알려
   * server-side producer 도 pause + 다른 참가자에게 broadcast 하게 한다.
   * ack 는 대기하지 않는다(local 은 이미 반영됨 — fire & forget).
   */
  const toggleProducer = useCallback(
    (producerRef: typeof audioProducerRef, setMuted: (v: boolean) => void) => {
      const producer = producerRef.current;
      if (producer === null || socket === null) return;
      const nextPaused = !producer.paused;
      if (nextPaused) producer.pause();
      else producer.resume();
      const request: ToggleProducerRequest = {
        code,
        producerId: producer.id,
        paused: nextPaused,
      };
      socket.emit(MEDIASOUP_WS_EVENTS.TOGGLE_PRODUCER, request);
      setMuted(nextPaused);
    },
    [socket, code],
  );

  const toggleAudio = useCallback(() => {
    toggleProducer(audioProducerRef, setIsAudioMuted);
  }, [toggleProducer]);

  const toggleVideo = useCallback(() => {
    toggleProducer(videoProducerRef, setIsVideoMuted);
  }, [toggleProducer]);

  const startScreenShare = useCallback(async () => {
    if (screenProducerRef.current !== null) return;
    const sendTransport = sendTransportRef.current;
    if (sendTransport === null) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack === undefined) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const producer = await sendTransport.produce({
        track: videoTrack as never,
        appData: { source: 'screen' as MediaType },
      });
      screenStreamRef.current = stream;
      screenProducerRef.current = producer;
      setScreenStream(stream);
      setIsSharingScreen(true);
      // 사용자가 브라우저 UI 의 '공유 중지' 를 눌렀을 때 트랙이 ended 로 전이된다.
      videoTrack.addEventListener('ended', () => stopScreenShare());
    } catch (e) {
      // 권한 거부 등은 noop — 상태 그대로 둔다.
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScreenShare = useCallback(() => {
    const producer = screenProducerRef.current;
    const stream = screenStreamRef.current;
    if (producer !== null) {
      try {
        producer.close();
      } catch {
        // already closed
      }
      // 서버에도 종료를 알려 ParticipantMedia 에서 제거 + 다른 참가자에게
      // PRODUCER_CLOSED broadcast 하게 한다. 이게 없으면 서버는 화면 공유가
      // 끝난 줄 모르고 동시 1인 제약이 풀리지 않는다(다른 사람이 공유 불가).
      if (socket !== null) {
        const request: CloseProducerRequest = { code, producerId: producer.id };
        socket.emit(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, request);
      }
    }
    if (stream !== null) {
      stream.getTracks().forEach((t) => t.stop());
    }
    screenProducerRef.current = null;
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsSharingScreen(false);
  }, [socket, code]);

  const isRemoteSharingScreen = remoteMedia.some((m) => m.source === 'screen');

  return {
    status,
    errorMessage,
    localStream,
    remoteMedia,
    isSharingScreen,
    screenStream,
    isRemoteSharingScreen,
    isAudioMuted,
    isVideoMuted,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
