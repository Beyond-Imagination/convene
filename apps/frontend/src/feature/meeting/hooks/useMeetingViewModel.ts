'use client';

import {
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
import { getHostToken } from '@/shared/stores/host-token.storage';
import {
  clearStoredNickname,
  getNickname,
} from '@/shared/stores/nickname.storage';
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
 * 채팅(useChatViewModel)·mediasoup(useMediasoupViewModel) ViewModel 이 본 hook 의
 * socket 인스턴스를 공유해 같은 연결 위에서 동작한다.
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
  /**
   * 이 회의의 host(회의 종료 권한자) 여부. 회의 생성자만 저장된 hostToken 을
   * 보유하므로 true. View 는 이 값으로 "회의 종료" 버튼 노출을 결정한다.
   */
  readonly isHost: boolean;
  /**
   * 회의를 떠나 다른 페이지로 이동하는 중인지(leave/endMeeting/meeting:ended).
   * nickname 이 null 이 됐을 때 "직접 접속(미인증, 닉네임 모달 표시)" 과
   * "퇴장 이동 중(화면 미렌더)" 을 View 가 구분하는 데 쓴다.
   */
  readonly isNavigatingAway: boolean;
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
  const storeNickname = useSessionStore((s) => s.nickname);
  const clearNickname = useSessionStore((s) => s.clearNickname);
  // 정적 호스팅에선 create/join → /meetings/{code} 이동이 풀 리로드라 in-memory store
  // 가 비므로, code 별 보관 닉네임(sessionStorage)에서 복구한다.
  const [persistedNickname, setPersistedNickname] = useState<string | null>(() =>
    getNickname(code),
  );
  const nickname = storeNickname ?? persistedNickname;

  const [status, setStatus] = useState<MeetingConnectionStatus>('connecting');
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectGen, setReconnectGen] = useState(0);
  // host 여부는 회의 진입 시점의 저장된 토큰으로 1회 판정한다(렌더 중 안정적).
  const [isHost] = useState(() => getHostToken(code) !== null);
  const socketRef = useRef<Socket | null>(null);
  const connectCountRef = useRef(0);
  /**
   * 회의가 종료된 상태에서 unmount 가 일어나면 useEffect cleanup 의 leave emit 이
   * 이미 닫힌 회의에 도달해 backend WS race 가 발생한다. endMeeting 직접 호출과
   * `meeting:ended` broadcast 수신 둘 다 본 ref 를 true 로 세팅해 cleanup 의
   * leave emit 을 skip 한다(backend handleLeave 도 swallow 로 방어하지만 frontend
   * 에서 보내지 않는 게 더 깔끔).
   */
  const skipLeaveOnCleanupRef = useRef(false);
  /**
   * leave/endMeeting/meeting:ended 로 회의를 떠나는 중인지. clearNickname() 으로
   * nickname 이 null 이 되면 본 effect 가 재실행되는데, 이때 "직접 URL 접근(미인증)"
   * 과 "정상 퇴장" 을 구분해야 한다. 퇴장 중이면 이미 목적지로 push/redirect 했으므로
   * 홈으로의 replace('/') 를 막는다(/reports 로의 이동과 경쟁 방지).
   */
  const isNavigatingAwayRef = useRef(false);

  // 회의를 떠날 때 닉네임 식별 정보(reactive store + code별 sessionStorage + 로컬 복구값)를
  // 모두 정리한다. 안 그러면 보관 닉네임이 남아 종료 후에도 nickname 이 non-null 로 남는다.
  const clearIdentity = useCallback(() => {
    clearNickname();
    setPersistedNickname(null);
    clearStoredNickname(code);
  }, [clearNickname, code]);

  useEffect(() => {
    if (nickname === null) {
      // 닉네임이 없으면 socket 을 만들지 않는다. 두 경우가 있다:
      //  - 링크로 회의에 직접 접속(미인증): MeetingPageClient 가 닉네임 입력 모달을
      //    띄우고, 입력되면 nickname 이 생겨 본 effect 가 재실행되며 정상 입장한다.
      //  - 회의 종료 후 퇴장(clearNickname): 이미 목적지로 이동 중이다.
      // 어느 경우든 여기서 홈으로 redirect 하지 않는다.
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
    const onMeetingEnded = (_payload: MeetingEndedBroadcast): void => {
      // 다른 참가자(또는 idle 자동 종료)에 의해 회의가 닫힘. 본인은 회의 화면을
      // 떠나 회의록 페이지로 이동한다. 회의가 이미 backend 에서 닫혔으므로
      // closeMeeting API 는 호출하지 않고, cleanup 의 leave emit 도 skip.
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
      // 저장된 hostToken 을 함께 보낸다. host 가 아니면 backend 가 403 으로 거부하고
      // 아래 catch 가 swallow 한다(버튼은 host 에게만 보이지만 방어적으로 전달).
      await closeMeeting(code, getHostToken(code) ?? undefined);
    } catch {
      // backend 가 already-closed 등으로 500 을 줄 수 있다 (idle 자동 종료와 race).
      // 회의록 생성은 이미 시작/완료된 상태이므로 사용자 흐름은 그대로 회의록 페이지로 보낸다.
    }
    // 회의가 이미 backend 에서 닫혔으므로 unmount 시 useEffect cleanup 이 leave 를
    // 다시 emit 해 race 를 만들지 않도록 차단(backend handleLeave 도 swallow 하지만
    // 노이즈를 줄이는 게 깔끔).
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
