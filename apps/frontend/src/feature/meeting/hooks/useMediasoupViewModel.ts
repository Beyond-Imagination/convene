'use client';

import {
  type CloseProducerRequest,
  type ConsumerClosedBroadcast,
  type ConsumeRequest,
  type ConsumeResponse,
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  type ListProducersRequest,
  type ListProducersResponse,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
  MEETING_WS_EVENTS,
  type NewProducerBroadcast,
  type ParticipantLeftBroadcast,
  type ProducerClosedBroadcast,
  type ProduceRequest,
  type ProduceResponse,
  type ProducerToggledBroadcast,
  type ResumeConsumerRequest,
} from '@migration/shared-interfaces';
import type { Device, Producer, Transport } from 'mediasoup-client/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

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
  /**
   * 마이크 켜기/끄기. 꺼져 있으면 getUserMedia 로 디바이스를 취득해 produce 하고,
   * 켜져 있으면 producer.close + track.stop 으로 해제한다(lazy acquisition).
   */
  readonly toggleAudio: () => void;
  /** 카메라 켜기/끄기. toggleAudio 와 동일하게 lazy 하게 취득/해제한다. */
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
  // 미디어 기본 OFF — 입장 시엔 카메라/마이크를 잡지 않고(lazy), 사용자가 토글로
  // 켤 때 비로소 getUserMedia 로 취득한다. 따라서 초깃값은 muted=true.
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  // video preview(self tile)용 stream. audio 는 별도 audioStreamRef 로 들고
  // 끄기 시 각각 track.stop() 으로 디바이스를 해제한다.
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenProducerRef = useRef<Producer | null>(null);
  const connectCountRef = useRef(0);
  // 'ended' 리스너가 항상 최신 stopScreenShare 를 부르도록 ref 로 들고 있는다.
  // startScreenShare 는 deps [] 라 첫 렌더(socket=null) 클로저를 고정하는데,
  // 그 안의 stopScreenShare 직접 참조는 socket=null 버전이라 closeProducer emit 이
  // 누락된다(stale closure). ref 우회로 socket 연결 이후 버전을 호출한다.
  const stopScreenShareRef = useRef<() => void>(() => {});

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
            const ad = appData as
              | { source?: MediaType; paused?: boolean }
              | undefined;
            const source = ad?.source ?? (kind as MediaType);
            const request: ProduceRequest = {
              code,
              transportId: sendOpts.id,
              kind: kind as 'audio' | 'video',
              source,
              rtpParameters,
              // 기본 OFF 입장은 appData.paused 로 의도를 싣는다 → 서버가 paused producer
              // 생성 + NEW_PRODUCER 에 paused 전파(produce 후 별도 TOGGLE race 제거).
              paused: ad?.paused ?? false,
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
   * 미디어 lazy acquisition — 입장 시점엔 카메라/마이크를 잡지 않는다.
   * (예전엔 ready 도달 직후 getUserMedia({audio,video}) + produce 후 pause 했는데,
   * 카메라 LED 가 잠깐 켜졌다 꺼지는 깜박임이 있었다.) 사용자가 toggleAudio/
   * toggleVideo 로 켤 때 비로소 getUserMedia 로 취득해 produce 하고, 끄면
   * producer.close + track.stop 으로 디바이스를 해제한다.
   *
   * 본 effect 는 재연결/unmount 시 toggle 로 켜 둔 미디어를 정리만 한다.
   */
  useEffect(() => {
    if (status !== 'ready') return undefined;
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      audioStreamRef.current = null;
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      setLocalStream(null);
      // 재연결/unmount 후엔 다시 기본 OFF 로 시작한다(사용자가 재요청해야 켜짐).
      setIsAudioMuted(true);
      setIsVideoMuted(true);
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
            // 기존 producer 가 이미 mute 상태일 수 있으므로 broadcast 의 paused 를 반영
            // 한다(늦게 입장 시 검은 화면 대신 placeholder 표시).
            paused: payload.paused ?? false,
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
    // 참가자가 떠나면(정상 leave / 비정상 종료 모두 서버가 PARTICIPANT_LEFT 발행)
    // 그 사람의 모든 remoteMedia 를 제거한다. 비정상 종료 시 producer 단위
    // PRODUCER_CLOSED 가 오지 않으므로, 이 정리가 없으면 검은 타일이 잔존하고
    // 그가 화면 공유 중이었다면 isRemoteSharingScreen 이 영영 true 로 남는다.
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
    };
  }, [status, socket, code]);

  /**
   * 마이크/카메라를 lazy 하게 켜고 끈다.
   *  - 꺼진 상태(producer 없음)에서 켜기: 이제서야 getUserMedia 로 디바이스를 잡고
   *    produce 한다. 그래서 입장 시점엔 카메라 LED 가 켜지지 않는다.
   *  - 켜진 상태에서 끄기: producer.close + track.stop 으로 디바이스를 완전히 해제하고
   *    CLOSE_PRODUCER 로 서버·다른 참가자에게 알린다(원격은 PRODUCER_CLOSED 로 정리).
   * getUserMedia 권한 거부 등은 noop(상태 그대로).
   */
  const toggleMedia = useCallback(
    async (
      kind: 'audio' | 'video',
      producerRef: typeof audioProducerRef,
      streamRef: typeof audioStreamRef,
      setMuted: (v: boolean) => void,
    ): Promise<void> => {
      const existing = producerRef.current;
      if (existing !== null) {
        // 끄기 — 디바이스 해제 + 서버 통지.
        try {
          existing.close();
        } catch {
          // already closed
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (socket !== null) {
          const request: CloseProducerRequest = { code, producerId: existing.id };
          socket.emit(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, request);
        }
        producerRef.current = null;
        streamRef.current = null;
        if (kind === 'video') setLocalStream(null);
        setMuted(true);
        return;
      }

      // 켜기 — 이제서야 디바이스를 잡고 produce.
      const sendTransport = sendTransportRef.current;
      if (sendTransport === null) return;
      try {
        const constraints = kind === 'audio' ? { audio: true } : { video: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track =
          kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (track === undefined) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const producer = await sendTransport.produce({
          track: track as never,
          appData: { source: kind as MediaType },
        });
        producerRef.current = producer;
        streamRef.current = stream;
        if (kind === 'video') setLocalStream(stream);
        setMuted(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErrorMessage(message);
      }
    },
    [socket, code],
  );

  const toggleAudio = useCallback(() => {
    void toggleMedia('audio', audioProducerRef, audioStreamRef, setIsAudioMuted);
  }, [toggleMedia]);

  const toggleVideo = useCallback(() => {
    void toggleMedia('video', videoProducerRef, localStreamRef, setIsVideoMuted);
  }, [toggleMedia]);

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
      // ref 경유로 최신 stopScreenShare 를 호출(stale closure 회피 — 위 ref 주석 참조).
      videoTrack.addEventListener('ended', () => stopScreenShareRef.current());
    } catch (e) {
      // 권한 거부 등은 noop — 상태 그대로 둔다.
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
    }
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

  // 최신 stopScreenShare 를 ref 에 반영해 'ended' 리스너가 그것을 호출하게 한다.
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

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
