'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type ChatPostedBroadcast,
  MEETING_WS_EVENTS,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@migration/shared-interfaces';

import { connectMeetingSocket } from '@/shared/socket/meeting.socket';
import { useSessionStore } from '@/shared/stores/session.store';

/**
 * `/meetings/[code]` 회의 화면의 ViewModel.
 *
 * 책임:
 *   - mount 시 닉네임 보유 여부 확인 (없으면 홈으로 redirect)
 *   - WS 연결 + `meeting:join` emit
 *   - participantJoined / participantLeft 브로드캐스트 수신 → 참가자 목록 갱신
 *   - unmount 시 `meeting:leave` emit + socket 종료
 *
 * v1 단계는 채팅/미디어 통합 없이 참가자 표시까지만 다룬다. 채팅(useChatViewModel)
 * 과 mediasoup 통합은 후속 사이클에서 본 hook 과 socket 인스턴스를 공유하도록
 * 확장한다.
 */

export type MeetingConnectionStatus = 'connecting' | 'joined' | 'error';

export interface RemoteParticipant {
  readonly socketId: string;
  readonly nickname: string;
  readonly joinedAt: string;
}

export interface UseMeetingViewModel {
  readonly code: string;
  readonly status: MeetingConnectionStatus;
  readonly nickname: string | null;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly errorMessage: string | null;
  readonly leave: () => void;
}

export function useMeetingViewModel(code: string): UseMeetingViewModel {
  const router = useRouter();
  const nickname = useSessionStore((s) => s.nickname);
  const clearNickname = useSessionStore((s) => s.clearNickname);

  const [status, setStatus] = useState<MeetingConnectionStatus>('connecting');
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (nickname === null) {
      router.replace('/');
      return;
    }

    const socket = connectMeetingSocket();
    socketRef.current = socket;

    const onConnect = (): void => {
      socket.emit(MEETING_WS_EVENTS.JOIN, { code, nickname });
      setStatus('joined');
    };
    const onConnectError = (err: Error): void => {
      setErrorMessage(err.message);
      setStatus('error');
    };
    const onParticipantJoined = (p: ParticipantJoinedBroadcast): void => {
      setRemoteParticipants((prev) => [
        ...prev.filter((x) => x.socketId !== p.socketId),
        { socketId: p.socketId, nickname: p.nickname, joinedAt: p.joinedAt },
      ]);
    };
    const onParticipantLeft = (p: ParticipantLeftBroadcast): void => {
      setRemoteParticipants((prev) => prev.filter((x) => x.socketId !== p.socketId));
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);

    if (socket.connected) {
      // 이미 connect 된 fake socket(테스트) 대응.
      onConnect();
    }

    return () => {
      socket.emit(MEETING_WS_EVENTS.LEAVE, { code });
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, nickname, router]);

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (socket !== null) {
      socket.emit(MEETING_WS_EVENTS.LEAVE, { code });
      socket.disconnect();
      socketRef.current = null;
    }
    clearNickname();
    router.push('/');
  }, [code, clearNickname, router]);

  // 채팅 통합(useChatViewModel) 후속 사이클에서 사용할 예정이므로 ChatPostedBroadcast
  // 타입을 사용한 곳을 명시적으로 남겨둔다.
  void ({} as ChatPostedBroadcast);

  return {
    code,
    status,
    nickname,
    remoteParticipants,
    errorMessage,
    leave,
  };
}
