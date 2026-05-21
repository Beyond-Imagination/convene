'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  MEETING_WS_EVENTS,
  type MeetingParticipantsBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@migration/shared-interfaces';

import { closeMeeting } from '@/shared/api/meeting.api';
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
  /**
   * mount 된 socket 인스턴스. 채팅/미디어 등 후속 ViewModel 이 같은 socket 으로
   * emit/listen 하도록 노출한다. mount 직후 또는 nickname 없는 redirect 상태에서는 null.
   */
  readonly socket: Socket | null;
  /**
   * 자동 재연결 횟수. 0=초기 연결, 1 이상=재연결 횟수.
   * useMediasoupViewModel 이 본 값을 deps 로 사용해 transport 를 재구축한다.
   */
  readonly reconnectGen: number;
  readonly leave: () => void;
  /**
   * 명시적 회의 종료 액션. backend `DELETE /meetings/:code` 를 호출해
   * `meeting.ended` 도메인 이벤트와 회의록 생성 파이프라인을 트리거한다.
   * 성공/실패 상관없이 닉네임을 clear 하고 회의록 목록(`/reports`)으로 이동한다.
   */
  readonly endMeeting: () => Promise<void>;
}

export function useMeetingViewModel(code: string): UseMeetingViewModel {
  const router = useRouter();
  const nickname = useSessionStore((s) => s.nickname);
  const clearNickname = useSessionStore((s) => s.clearNickname);

  const [status, setStatus] = useState<MeetingConnectionStatus>('connecting');
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectGen, setReconnectGen] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const connectCountRef = useRef(0);

  useEffect(() => {
    if (nickname === null) {
      router.replace('/');
      return;
    }

    const next = connectMeetingSocket();
    socketRef.current = next;
    setSocket(next);
    connectCountRef.current = 0;
    setReconnectGen(0);
    const socket = next;

    const onConnect = (): void => {
      connectCountRef.current += 1;
      if (connectCountRef.current > 1) {
        // 재연결: 끊긴 동안의 stale 참가자 정보를 버리고 backend 의 새 broadcast 로 다시 채운다.
        setRemoteParticipants([]);
        setReconnectGen(connectCountRef.current - 1);
      }
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
    const onParticipants = (payload: MeetingParticipantsBroadcast): void => {
      // 회의 입장 직후 본인에게만 오는 기존 참가자 스냅숏. stale 상태를 무시하고
      // 서버 측 목록으로 덮어쓴다.
      setRemoteParticipants(
        payload.participants.map((p) => ({
          socketId: p.socketId,
          nickname: p.nickname,
          joinedAt: p.joinedAt,
        })),
      );
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
    socket.on(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);

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
      socket.off(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [code, nickname, router]);

  const leave = useCallback(() => {
    const current = socketRef.current;
    if (current !== null) {
      current.emit(MEETING_WS_EVENTS.LEAVE, { code });
      current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    clearNickname();
    router.push('/');
  }, [code, clearNickname, router]);

  const endMeeting = useCallback(async (): Promise<void> => {
    try {
      await closeMeeting(code);
    } catch {
      // backend 가 already-closed 등으로 500 을 줄 수 있다 (idle 자동 종료와 race).
      // 회의록 생성은 이미 시작/완료된 상태이므로 사용자 흐름은 그대로 회의록 페이지로 보낸다.
    }
    const current = socketRef.current;
    if (current !== null) {
      current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    clearNickname();
    router.push('/reports');
  }, [code, clearNickname, router]);

  return {
    code,
    status,
    nickname,
    remoteParticipants,
    errorMessage,
    socket,
    reconnectGen,
    leave,
    endMeeting,
  };
}
