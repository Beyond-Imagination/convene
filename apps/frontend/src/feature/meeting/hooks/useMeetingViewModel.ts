'use client';

import {
  type JoinMeetingAck,
  MEETING_WS_EVENTS,
  type MeetingEndedBroadcast,
  type MeetingParticipantsBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@convene/shared-interfaces';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { closeMeeting } from '@/shared/api/meeting.api';
import { connectMeetingSocket } from '@/shared/socket/meeting.socket';
import { getHostToken, saveHostToken } from '@/shared/stores/host-token.storage';
import { clearStoredNickname, getNickname } from '@/shared/stores/nickname.storage';
import { useSessionStore } from '@/shared/stores/session.store';

export type MeetingConnectionStatus = 'connecting' | 'joined' | 'error';

// 응답이 오지 않으면 화면이 '연결 중'에 멈추므로 상한을 둔다.
const JOIN_ACK_TIMEOUT_MS = 10_000;

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
   * mount 된 socket 인스턴스. 채팅/미디어 등 후속 ViewModel이 같은 socket으로 emit/listen 하도록 노출한다.
   * mount 직후 또는 nickname 없는 redirect 상태에서는 null.
   */
  readonly socket: Socket | null;
  /**
   * 자동 재연결 횟수. 0=초기 연결, 1 이상=재연결 횟수.
   */
  readonly reconnectGen: number;
  /**
   * 이 회의의 host(회의 종료 권한자) 여부. View는 이 값으로 "회의 종료" 버튼 노출을 결정한다.
   */
  readonly isHost: boolean;
  /**
   * 회의를 떠나 다른 페이지로 이동하는 중인지.
   * nickname이 null이 됐을 때 "직접 접속"과  "퇴장 이동 중"을 View가 구분하는 데 사용
   */
  readonly isNavigatingAway: boolean;
  readonly leave: () => void;
  /**
   * 명시적 회의 종료 액션. backend `DELETE /meetings/:code`를 호출해 도메인 이벤트와 회의록 생성 파이프라인을 트리거한다.
   * 성공/실패 상관없이 닉네임을 clear 하고 회의록 목록(`/reports`)으로 이동한다.
   */
  readonly endMeeting: () => Promise<void>;
}

/**
 * `/meetings/[code]` 회의 화면의 ViewModel.
 *
 * 책임:
 *   - mount 시 닉네임 보유 여부 확인 (없으면 홈으로 redirect)
 *   - WS 연결 + `meeting:join` emit
 *   - participantJoined / participantLeft 브로드캐스트 수신 → 참가자 목록 갱신
 *   - unmount 시 `meeting:leave` emit + socket 종료
 *
 * 채팅(useChatViewModel)·mediasoup(useMediasoupViewModel) ViewModel이 본 hook의 socket 인스턴스를 공유해 같은 연결 위에서 동작한다.
 */
export function useMeetingViewModel(code: string): UseMeetingViewModel {
  const router = useRouter();
  const storeNickname = useSessionStore((s) => s.nickname);
  const clearNickname = useSessionStore((s) => s.clearNickname);
  // 정적 호스팅에선 create/join → /meetings/{code} 이동이 풀 리로드라 in-memory store가 비므로,
  // code 별 보관 닉네임(sessionStorage)에서 복구한다.
  const [persistedNickname, setPersistedNickname] = useState<string | null>(() =>
    getNickname(code),
  );
  const nickname = storeNickname ?? persistedNickname;

  const [status, setStatus] = useState<MeetingConnectionStatus>('connecting');
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectGen, setReconnectGen] = useState(0);
  // 저장된 토큰(회의를 만든 본인)으로 시작하고, 빈 방에 처음 들어가 host를 넘겨받으면 갱신된다.
  const [isHost, setIsHost] = useState(() => getHostToken(code) !== null);
  const socketRef = useRef<Socket | null>(null);
  const connectCountRef = useRef(0);
  /**
   * 회의가 종료된 상태에서 unmount가 일어나면 useEffect cleanup의 leave emit이 이미 닫힌 회의에 도달해 backend WS race가 발생한다.
   * endMeeting 직접 호출과 `meeting:ended` broadcast 수신 둘 다 본 ref를 true로 세팅해 cleanup의 leave emit을 skip 한다.
   * (backend handleLeave도 swallow로 방어하지만 frontend에서 보내지 않는 게 더 깔끔).
   */
  const skipLeaveOnCleanupRef = useRef(false);
  /**
   * leave/endMeeting/meeting:ended로 회의를 떠나는 중인지.
   * clearNickname()으로 nickname이 null이 되면 본 effect가 재실행되는데, 이때 "직접 URL 접근(미인증)"과 "정상 퇴장"을 구분해야 한다.
   * 퇴장 중이면 이미 목적지로 push/redirect 했으므로 홈으로의 replace('/')를 막는다(/reports로의 이동과 경쟁 방지).
   */
  const isNavigatingAwayRef = useRef(false);

  // 회의를 떠날 때 닉네임 식별 정보(reactive store + code별 sessionStorage + 로컬 복구값)를 모두 정리한다.
  // 안 그러면 보관 닉네임이 남아 종료 후에도 nickname이 non-null로 남는다.
  const clearIdentity = useCallback(() => {
    clearNickname();
    setPersistedNickname(null);
    clearStoredNickname(code);
  }, [clearNickname, code]);

  useEffect(() => {
    if (nickname === null) {
      // 닉네임이 없으면 socket을 만들지 않는다. 두 경우가 있다. 하지만 어느 경우든 여기서 홈으로 redirect 하지 않는다.
      return;
    }

    skipLeaveOnCleanupRef.current = false;
    const next = connectMeetingSocket();
    socketRef.current = next;
    setSocket(next);
    connectCountRef.current = 0;
    setReconnectGen(0);
    const socket = next;

    const onConnect = (): void => {
      connectCountRef.current += 1;
      if (connectCountRef.current > 1) {
        // 재연결: 끊긴 동안의 stale 참가자 정보를 버리고 backend의 새 broadcast로 다시 채운다.
        setRemoteParticipants([]);
        setReconnectGen(connectCountRef.current - 1);
      }
      // 예약 회의는 이 join이 처리되면서 방이 열린다. 그래서 응답을 받고 나서야
      // 'joined'가 되고, 미디어 협상은 그 뒤에 시작한다(방 없는 상태로 RPC 금지).
      socket
        .timeout(JOIN_ACK_TIMEOUT_MS)
        .emit(
          MEETING_WS_EVENTS.JOIN,
          { code, nickname },
          (err: Error | null, ack?: JoinMeetingAck) => {
            if (err !== null || ack === undefined) {
              setErrorMessage('회의에 입장하지 못했습니다. 링크가 유효한지 확인해 주세요.');
              setStatus('error');
              return;
            }
            setStatus('joined');
            // 빈 방에 처음 들어간 경우에만 토큰이 온다. null이면 기존 토큰을 그대로 둔다.
            if (ack.hostToken == null) return;
            saveHostToken(code, ack.hostToken);
            setIsHost(true);
          },
        );
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
      // 회의 입장 직후 본인에게만 오는 기존 참가자 스냅숏. stale 상태를 무시하고 서버 측 목록으로 덮어쓴다.
      setRemoteParticipants(
        payload.participants.map((p) => ({
          socketId: p.socketId,
          nickname: p.nickname,
          joinedAt: p.joinedAt,
        })),
      );
    };
    const onMeetingEnded = (_payload: MeetingEndedBroadcast): void => {
      // 다른 참가자(또는 idle 자동 종료)에 의해 회의가 닫힘.
      // 본인은 회의 화면을 떠나 회의록 페이지로 이동한다.
      // 회의가 이미 backend에서 닫혔으므로 closeMeeting API는 호출하지 않고, cleanup의 leave emit도 skip.
      skipLeaveOnCleanupRef.current = true;
      isNavigatingAwayRef.current = true;
      const current = socketRef.current;
      if (current !== null) {
        current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      router.push('/reports');
      clearIdentity();
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
    socket.on(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);
    socket.on(MEETING_WS_EVENTS.ENDED, onMeetingEnded);

    if (socket.connected) {
      // 이미 connect 된 fake socket(테스트) 대응.
      onConnect();
    }

    return () => {
      if (!skipLeaveOnCleanupRef.current) {
        socket.emit(MEETING_WS_EVENTS.LEAVE, { code });
      }
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
      socket.off(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);
      socket.off(MEETING_WS_EVENTS.ENDED, onMeetingEnded);
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [code, nickname, router, clearIdentity]);

  const leave = useCallback(() => {
    isNavigatingAwayRef.current = true;
    const current = socketRef.current;
    if (current !== null) {
      current.emit(MEETING_WS_EVENTS.LEAVE, { code });
      current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    router.push('/');
    clearIdentity();
  }, [code, clearIdentity, router]);

  const endMeeting = useCallback(async (): Promise<void> => {
    try {
      // 저장된 hostToken을 함께 보낸다.
      // host가 아니면 backend가 403으로 거부하고 아래 catch가 swallow 한다(버튼은 host에게만 보이지만 방어적으로 전달).
      await closeMeeting(code, getHostToken(code) ?? undefined);
    } catch {
      // backend가 already-closed 등으로 500을 줄 수 있다 (idle 자동 종료와 race).
      // 회의록 생성은 이미 시작/완료된 상태이므로 사용자 흐름은 그대로 회의록 페이지로 보낸다.
    }
    // 회의가 이미 backend에서 닫혔으므로 unmount 시 useEffect cleanup이 leave를 다시 emit 해 race를 만들지 않도록 차단
    // (backend handleLeave도 swallow 하지만 노이즈를 줄이는 게 깔끔).
    skipLeaveOnCleanupRef.current = true;
    isNavigatingAwayRef.current = true;
    const current = socketRef.current;
    if (current !== null) {
      current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    router.push('/reports');
    clearIdentity();
  }, [code, clearIdentity, router]);

  return {
    code,
    status,
    nickname,
    remoteParticipants,
    errorMessage,
    socket,
    reconnectGen,
    isHost,
    isNavigatingAway: isNavigatingAwayRef.current,
    leave,
    endMeeting,
  };
}
