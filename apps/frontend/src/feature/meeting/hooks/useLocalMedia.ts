'use client';

import {
  type CloseProducerRequest,
  MEDIASOUP_WS_EVENTS,
  type MediaType,
} from '@convene/shared-interfaces';
import type { Producer, Transport } from 'mediasoup-client/types';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import type { MediasoupConnectionStatus } from '@/feature/meeting/hooks/useMediasoupTransport';

export interface LocalMediaDeps {
  readonly socket: Socket | null;
  readonly code: string;
  readonly status: MediasoupConnectionStatus;
  readonly sendTransportRef: MutableRefObject<Transport | null>;
  readonly reportError: (message: string) => void;
}

export interface UseLocalMedia {
  readonly localStream: MediaStream | null;
  readonly screenStream: MediaStream | null;
  readonly isSharingScreen: boolean;
  /** 내 마이크가 mute(paused) 상태인지. */
  readonly isAudioMuted: boolean;
  /** 내 카메라가 mute(paused) 상태인지. */
  readonly isVideoMuted: boolean;
  /**
   * 마이크 켜기/끄기. 꺼져 있으면 getUserMedia로 디바이스를 취득해 produce 하고,
   * 켜져 있으면 producer.close + track.stop으로 해제한다(lazy acquisition).
   */
  readonly toggleAudio: () => void;
  /** 카메라 켜기/끄기. toggleAudio와 동일하게 lazy 하게 취득/해제한다. */
  readonly toggleVideo: () => void;
  /**
   * 사용자의 화면을 mediasoup으로 produce 한다. getDisplayMedia 권한 거부나 이미 공유 중인 경우 noop.
   * produce 이벤트는 sendTransport의 'produce' 핸들러가 PRODUCE RPC(source='screen')로 위임한다.
   */
  readonly startScreenShare: () => Promise<void>;
  readonly stopScreenShare: () => void;
}

/**
 * 내가 송출하는 미디어 — 마이크/카메라 lazy 토글 + 화면 공유.
 *
 * 입장 시점엔 어떤 디바이스도 잡지 않는다(카메라 LED가 켜지지 않는다).
 * 사용자가 토글로 켤 때 비로소 getUserMedia로 취득해 produce 하고,
 * 끄면 producer.close + track.stop으로 디바이스를 완전히 해제한다.
 */
export function useLocalMedia({
  socket,
  code,
  status,
  sendTransportRef,
  reportError,
}: LocalMediaDeps): UseLocalMedia {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  // 미디어 기본 OFF — 입장 시엔 카메라/마이크를 잡지 않고(lazy), 사용자가 토글로 켤 때 비로소 getUserMedia로 취득한다. 따라서 초깃값은 muted=true.
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  // video preview(self tile)용 stream. audio는 별도 audioStreamRef로 들고 끄기 시 각각 track.stop()으로 디바이스를 해제한다.
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenProducerRef = useRef<Producer | null>(null);
  // 'ended' 리스너가 항상 최신 stopScreenShare를 부르도록 ref로 들고 있는다.
  // startScreenShare는 첫 렌더(socket=null) 클로저를 고정하는데,
  // 그 안의 stopScreenShare 직접 참조는 socket=null 버전이라 closeProducer emit이
  // 누락된다(stale closure). ref 우회로 socket 연결 이후 버전을 호출한다.
  const stopScreenShareRef = useRef<() => void>(() => {});

  // 재연결/unmount 로 transport가 내려가면 토글로 켜 둔 미디어를 정리한다.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      audioStreamRef.current = null;
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      screenProducerRef.current = null;
      screenStreamRef.current = null;
      setScreenStream(null);
      setLocalStream(null);
      // 재연결/unmount 후엔 다시 기본 OFF로 시작한다(사용자가 재요청해야 켜짐).
      setIsAudioMuted(true);
      setIsVideoMuted(true);
      setIsSharingScreen(false);
    };
  }, [status]);

  /**
   * 마이크/카메라를 lazy 하게 켜고 끈다.
   *  - 꺼진 상태(producer 없음)에서 켜기: 이제서야 getUserMedia로 디바이스를 잡고 produce 한다.
   *  - 켜진 상태에서 끄기: producer.close + track.stop으로 디바이스를 완전히 해제하고 CLOSE_PRODUCER로 서버·다른 참가자에게 알린다.
   *    (원격은 PRODUCER_CLOSED로 정리)
   * getUserMedia 권한 거부 등은 noop(상태 그대로).
   */
  const toggleMedia = useCallback(
    async (
      kind: 'audio' | 'video',
      producerRef: MutableRefObject<Producer | null>,
      streamRef: MutableRefObject<MediaStream | null>,
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
        // 오디오는 노이즈 억제/에코 제거/자동 게인을 명시적으로 요청한다(기본값 의존 X).
        // voiceIsolation은 표준 외(Chrome/Edge 110+): 지원 시 ML 음성 격리 강화, 미지원 시 무시.
        const constraints: MediaStreamConstraints =
          kind === 'audio'
            ? {
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  voiceIsolation: true,
                } as MediaTrackConstraints,
              }
            : { video: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (track === undefined) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const producer = await sendTransport.produce({
          track: track as never,
          ...(kind === 'audio'
            ? {
                codecOptions: {
                  opusFec: true,
                  opusDtx: false,
                  opusMaxPlaybackRate: 48000,
                  opusMaxAverageBitrate: 64000,
                },
              }
            : {}),
          appData: { source: kind as MediaType },
        });
        producerRef.current = producer;
        streamRef.current = stream;
        if (kind === 'video') setLocalStream(stream);
        setMuted(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        reportError(message);
      }
    },
    [socket, code, sendTransportRef, reportError],
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
      // 사용자가 브라우저 UI의 '공유 중지' 를 눌렀을 때 트랙이 ended로 전이된다.
      // ref 경유로 최신 stopScreenShare를 호출(stale closure 회피 — 위 ref 주석 참조).
      videoTrack.addEventListener('ended', () => stopScreenShareRef.current());
    } catch (e) {
      // 권한 거부 등은 noop — 상태 그대로 둔다.
      const message = e instanceof Error ? e.message : String(e);
      reportError(message);
    }
  }, [sendTransportRef, reportError]);

  const stopScreenShare = useCallback(() => {
    const producer = screenProducerRef.current;
    const stream = screenStreamRef.current;
    if (producer !== null) {
      try {
        producer.close();
      } catch {
        // already closed
      }
      // 서버에도 종료를 알려 ParticipantMedia에서 제거 + 다른 참가자에게 PRODUCER_CLOSED broadcast 하게 한다.
      // 이게 없으면 서버는 화면 공유가 끝난 줄 모르고 동시 1인 제약이 풀리지 않는다(다른 사람이 공유 불가).
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

  // 최신 stopScreenShare를 ref에 반영해 'ended' 리스너가 그것을 호출하게 한다.
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  return {
    localStream,
    screenStream,
    isSharingScreen,
    isAudioMuted,
    isVideoMuted,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
