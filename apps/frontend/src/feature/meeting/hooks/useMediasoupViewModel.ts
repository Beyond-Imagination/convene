'use client';

import type { Socket } from 'socket.io-client';

import { useLocalMedia } from '@/feature/meeting/hooks/useLocalMedia';
import {
  type MediasoupConnectionStatus,
  useMediasoupTransport,
} from '@/feature/meeting/hooks/useMediasoupTransport';
import { type RemoteMediaEntry, useRemoteMedia } from '@/feature/meeting/hooks/useRemoteMedia';

export type { MediasoupConnectionStatus, RemoteMediaEntry };

export interface UseMediasoupViewModel {
  readonly status: MediasoupConnectionStatus;
  readonly errorMessage: string | null;
  readonly localStream: MediaStream | null;
  readonly remoteMedia: ReadonlyArray<RemoteMediaEntry>;
  readonly isSharingScreen: boolean;
  readonly screenStream: MediaStream | null;
  readonly isRemoteSharingScreen: boolean;
  readonly isAudioMuted: boolean;
  readonly isVideoMuted: boolean;
  readonly toggleAudio: () => void;
  readonly toggleVideo: () => void;
  readonly startScreenShare: () => Promise<void>;
  readonly stopScreenShare: () => void;
}

/**
 * 회의 화면이 쓰는 mediasoup ViewModel — 세 hook을 조립해 하나의 인터페이스로 내보낸다.
 *
 *   useMediasoupTransport : device + send/recv transport 준비, status/errorMessage 소유
 *   useRemoteMedia        : 다른 참가자 미디어 consume (recv 쪽)
 *   useLocalMedia         : 내 마이크/카메라/화면 공유 produce (send 쪽)
 *
 * transport가 만든 ref를 나머지 둘에게 넘기는 것이 유일한 결합점이라, 증상별로
 * (송출 이상 → useLocalMedia, 수신 이상 → useRemoteMedia) 한 파일만 열면 된다.
 */
export function useMediasoupViewModel(socket: Socket | null, code: string): UseMediasoupViewModel {
  const transport = useMediasoupTransport(socket, code);

  const remote = useRemoteMedia({
    socket,
    code,
    status: transport.status,
    deviceRef: transport.deviceRef,
    recvTransportRef: transport.recvTransportRef,
  });

  const local = useLocalMedia({
    socket,
    code,
    status: transport.status,
    sendTransportRef: transport.sendTransportRef,
    reportError: transport.reportError,
  });

  return {
    status: transport.status,
    errorMessage: transport.errorMessage,
    localStream: local.localStream,
    remoteMedia: remote.remoteMedia,
    isSharingScreen: local.isSharingScreen,
    screenStream: local.screenStream,
    isRemoteSharingScreen: remote.isRemoteSharingScreen,
    isAudioMuted: local.isAudioMuted,
    isVideoMuted: local.isVideoMuted,
    toggleAudio: local.toggleAudio,
    toggleVideo: local.toggleVideo,
    startScreenShare: local.startScreenShare,
    stopScreenShare: local.stopScreenShare,
  };
}
