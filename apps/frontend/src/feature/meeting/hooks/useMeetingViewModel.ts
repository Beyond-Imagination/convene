'use client';

import {
  type ChatPostedBroadcast,
  type JoinMeetingRejectReason,
  type JoinMeetingResponse,
  MEETING_WS_EVENTS,
  type MeetingEndedBroadcast,
  type MeetingParticipantsBroadcast,
  type ParticipantDisconnectedBroadcast,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
  type ParticipantReconnectedBroadcast,
} from '@convene/shared-interfaces';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { closeMeeting } from '@/shared/api/meeting.api';
import { connectMeetingSocket } from '@/shared/socket/meeting.socket';
import {
  clearMeetingState,
  getHostToken,
  getNickname,
  getParticipantId,
  saveHostToken,
} from '@/shared/stores/meeting.storage';
import { useSessionStore } from '@/shared/stores/session.store';

export type MeetingConnectionStatus =
  | 'connecting'
  | 'joined'
  | 'reconnecting'
  | 'error'
  /** 서버가 입장을 거부했다. 재시도해도 달라지지 않는다. */
  | 'not-found'
  | 'closed';

// 응답이 오지 않으면 화면이 '연결 중'에 멈추므로 상한을 둔다.
const JOIN_ACK_TIMEOUT_MS = 10_000;

/** 입장이 막힌 이유. 회의 화면 대신 이 사유의 안내 화면을 그린다. */
export type MeetingEntryBlock = 'not-found' | 'closed' | 'failed';

/** 서버가 준 거부 사유별 화면 상태와 안내. 모르는 사유는 일반 입장 실패로 떨어진다. */
const REJECTIONS: Partial<
  Record<JoinMeetingRejectReason, { status: MeetingConnectionStatus; message: string }>
> = {
  'not-found': {
    status: 'not-found',
    message: '존재하지 않는 회의입니다. 회의 코드나 링크를 확인해 주세요.',
  },
  closed: { status: 'closed', message: '이미 종료된 회의입니다.' },
};

const entryBlockOf = (
  status: MeetingConnectionStatus,
  joinedOnce: boolean,
): MeetingEntryBlock | null => {
  if (status === 'not-found' || status === 'closed') return status;
  // 입장한 뒤의 오류(재입장 실패)는 이미 참여 중이므로 회의 화면을 닫지 않는다.
  return status === 'error' && !joinedOnce ? 'failed' : null;
};

export interface RemoteParticipant {
  readonly participantId: string;
  readonly nickname: string;
  readonly joinedAt: string;
  readonly disconnected: boolean;
}

export interface UseMeetingViewModel {
  readonly code: string;
  readonly status: MeetingConnectionStatus;
  readonly nickname: string | null;
  readonly remoteParticipants: ReadonlyArray<RemoteParticipant>;
  readonly errorMessage: string | null;
  /**
   * 입장이 확정되기 전에 실패해 회의에 들어가지 못한 이유. 들어갔으면 null.
   * View는 이 값이 있으면 회의 화면 대신 진입 화면을 그린다.
   */
  readonly entryBlock: MeetingEntryBlock | null;
  /**
   * mount 된 socket 인스턴스. 채팅/미디어 등 후속 ViewModel이 같은 socket으로 emit/listen 하도록 노출한다.
   * mount 직후 또는 nickname 없는 redirect 상태에서는 null.
   */
  readonly socket: Socket | null;
  /**
   * 재입장이 서버에 확인된 횟수. 0=최초 입장, 1 이상=재접속 확인.
   * 미디어 복구는 이 값이 오른 뒤에 시작해야 한다 — 그 전에는 서버가 이 소켓의 신원을 모른다.
   */
  readonly rejoinGen: number;
  /**
   * 직전 재입장이 유예 안의 복귀였는지. false면 서버가 미디어를 이미 정리했으므로
   * 살아 있는 transport를 재사용하려 해선 안 된다.
   */
  readonly rejoinPreservedMedia: boolean;
  /** 끊긴 구간에 오간 대화를 채팅 ViewModel이 이 값으로 복원한다. */
  readonly chatHistory: ReadonlyArray<ChatPostedBroadcast>;
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
 *   - mount 시 닉네임 보유 여부 확인 (없으면 socket을 만들지 않는다)
 *   - WS 연결 + `meeting:join` emit (회의별 안정 participantId 지참)
 *   - participantJoined / Left / Disconnected / Reconnected 수신 → 참가자 목록 갱신
 *   - unmount 시 `meeting:leave` emit + socket 종료. 리로드·탭 닫기는 leave를 보내지 않는다.
 *
 * 채팅(useChatViewModel)·mediasoup(useMediasoupViewModel) ViewModel이 본 hook의 socket 인스턴스를 공유해 같은 연결 위에서 동작한다.
 */
export function useMeetingViewModel(code: string, enabled = true): UseMeetingViewModel {
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
  const [rejoinGen, setRejoinGen] = useState(0);
  const [rejoinPreservedMedia, setRejoinPreservedMedia] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatPostedBroadcast[]>([]);
  // 저장된 토큰(회의를 만든 본인)으로 시작하고, 빈 방에 처음 들어가 host를 넘겨받으면 갱신된다.
  const [isHost, setIsHost] = useState(() => getHostToken(code) !== null);
  const socketRef = useRef<Socket | null>(null);
  const connectCountRef = useRef(0);
  // 입장 전 끊김을 'reconnecting'으로 올리면 방이 열리기 전에 미디어 RPC가 나간다.
  const joinedOnceRef = useRef(false);
  /**
   * 회의가 종료된 상태에서 unmount가 일어나면 useEffect cleanup의 leave emit이 이미 닫힌 회의에 도달해 backend WS race가 발생한다.
   * endMeeting 직접 호출과 `meeting:ended` broadcast 수신 둘 다 본 ref를 true로 세팅해 cleanup의 leave emit을 skip 한다.
   * 리로드·탭 닫기(`pagehide`)도 같은 ref를 세운다.
   */
  const skipLeaveOnCleanupRef = useRef(false);
  /**
   * leave/endMeeting/meeting:ended로 회의를 떠나는 중인지.
   * clearNickname()으로 nickname이 null이 되면 본 effect가 재실행되는데, 이때 "직접 URL 접근(미인증)"과 "정상 퇴장"을 구분해야 한다.
   * 퇴장 중이면 이미 목적지로 push/redirect 했으므로 홈으로의 replace('/')를 막는다(/reports로의 이동과 경쟁 방지).
   */
  const isNavigatingAwayRef = useRef(false);
  /** 서버가 입장을 거부해 우리가 소켓을 끊은 경우. 뒤따르는 disconnect를 재연결로 오인하지 않는다. */
  const joinRejectedRef = useRef(false);

  // 정상 퇴장·종료 경로에서만 부른다. 닉네임뿐 아니라 participantId·hostToken·미디어 의도까지
  // 버려야 같은 링크로 다시 들어갈 때 이전 참가자로 되살아나거나 마이크가 저절로 켜지지 않는다.
  const clearIdentity = useCallback(() => {
    clearNickname();
    setPersistedNickname(null);
    clearMeetingState(code);
  }, [clearNickname, code]);

  useEffect(() => {
    // enabled=false는 "이 회의에 들어가도 되는지" 판정이 끝나기 전이다. 판정 전에 join을 보내지 않는다.
    if (!enabled || nickname === null) {
      // 닉네임이 없으면 socket을 만들지 않는다. 두 경우가 있다. 하지만 어느 경우든 여기서 홈으로 redirect 하지 않는다.
      return;
    }

    skipLeaveOnCleanupRef.current = false;
    joinRejectedRef.current = false;
    const participantId = getParticipantId(code);
    const next = connectMeetingSocket();
    socketRef.current = next;
    setSocket(next);
    connectCountRef.current = 0;
    setRejoinGen(0);
    const socket = next;

    const onConnect = (): void => {
      connectCountRef.current += 1;
      if (connectCountRef.current > 1) {
        // 재연결: 끊긴 동안의 stale 참가자 정보를 버리고 backend의 새 broadcast로 다시 채운다.
        setRemoteParticipants([]);
      }
      // 예약 회의는 이 join이 처리되면서 방이 열린다. 그래서 응답을 받고 나서야
      // 'joined'가 되고, 미디어 협상은 그 뒤에 시작한다(방 없는 상태로 RPC 금지).
      socket
        .timeout(JOIN_ACK_TIMEOUT_MS)
        .emit(
          MEETING_WS_EVENTS.JOIN,
          { code, nickname, participantId },
          (err: Error | null, ack?: JoinMeetingResponse) => {
            if (err !== null || ack === undefined) {
              setErrorMessage('회의에 입장하지 못했습니다. 링크가 유효한지 확인해 주세요.');
              setStatus('error');
              return;
            }
            if (!ack.ok) {
              // 입장 거부다. 재연결·재입장을 계속해도 달라지지 않으므로 연결을 끊는다.
              const rejection = REJECTIONS[ack.reason];
              joinRejectedRef.current = true;
              skipLeaveOnCleanupRef.current = true;
              socket.disconnect();
              setErrorMessage(rejection?.message ?? '회의에 입장할 수 없습니다.');
              setStatus(rejection?.status ?? 'error');
              return;
            }
            setStatus('joined');
            joinedOnceRef.current = true;
            // ack이 와야 서버가 이 소켓을 참가자로 인식한다. 미디어 복구는 그 뒤다.
            if (connectCountRef.current > 1) {
              setRejoinPreservedMedia(ack.reconnected);
              setRejoinGen(connectCountRef.current - 1);
            }
            setChatHistory(ack.chat);
            // 빈 방에 처음 들어간 경우에만 토큰이 온다. null이면 기존 토큰을 그대로 둔다.
            if (ack.hostToken == null) return;
            saveHostToken(code, ack.hostToken);
            setIsHost(true);
          },
        );
    };
    const onDisconnect = (): void => {
      if (joinRejectedRef.current || !joinedOnceRef.current) return;
      setStatus('reconnecting');
    };
    const onConnectError = (err: Error): void => {
      // 재연결 시도 중 실패는 계속 재시도되므로 오류로 올리지 않는다.
      if (connectCountRef.current > 0) return;
      setErrorMessage(err.message);
      setStatus('error');
    };
    const onParticipantJoined = (p: ParticipantJoinedBroadcast): void => {
      setRemoteParticipants((prev) => [
        ...prev.filter((x) => x.participantId !== p.participantId),
        {
          participantId: p.participantId,
          nickname: p.nickname,
          joinedAt: p.joinedAt,
          disconnected: false,
        },
      ]);
    };
    const onParticipantLeft = (p: ParticipantLeftBroadcast): void => {
      setRemoteParticipants((prev) => prev.filter((x) => x.participantId !== p.participantId));
    };
    const onParticipantDisconnected = (p: ParticipantDisconnectedBroadcast): void => {
      setRemoteParticipants((prev) =>
        prev.map((x) => (x.participantId === p.participantId ? { ...x, disconnected: true } : x)),
      );
    };
    const onParticipantReconnected = (p: ParticipantReconnectedBroadcast): void => {
      setRemoteParticipants((prev) =>
        prev.map((x) => (x.participantId === p.participantId ? { ...x, disconnected: false } : x)),
      );
    };
    const onParticipants = (payload: MeetingParticipantsBroadcast): void => {
      // 회의 입장 직후 본인에게만 오는 기존 참가자 스냅숏. stale 상태를 무시하고 서버 측 목록으로 덮어쓴다.
      setRemoteParticipants(
        payload.participants.map((p) => ({
          participantId: p.participantId,
          nickname: p.nickname,
          joinedAt: p.joinedAt,
          disconnected: p.disconnected,
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
    // leave를 보내면 유예 없이 즉시 퇴장 처리돼 새로고침이 같은 참가자로 복귀하지 못한다.
    const onPageHide = (): void => {
      skipLeaveOnCleanupRef.current = true;
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED, onParticipantDisconnected);
    socket.on(MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED, onParticipantReconnected);
    socket.on(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);
    socket.on(MEETING_WS_EVENTS.ENDED, onMeetingEnded);
    window.addEventListener('pagehide', onPageHide);

    if (socket.connected) {
      // 이미 connect 된 fake socket(테스트) 대응.
      onConnect();
    }

    return () => {
      if (!skipLeaveOnCleanupRef.current) {
        socket.emit(MEETING_WS_EVENTS.LEAVE, { code });
      }
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_JOINED, onParticipantJoined);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_LEFT, onParticipantLeft);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_DISCONNECTED, onParticipantDisconnected);
      socket.off(MEETING_WS_EVENTS.PARTICIPANT_RECONNECTED, onParticipantReconnected);
      socket.off(MEETING_WS_EVENTS.PARTICIPANTS, onParticipants);
      socket.off(MEETING_WS_EVENTS.ENDED, onMeetingEnded);
      window.removeEventListener('pagehide', onPageHide);
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [code, enabled, nickname, router, clearIdentity]);

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
    entryBlock: entryBlockOf(status, joinedOnceRef.current),
    socket,
    rejoinGen,
    rejoinPreservedMedia,
    chatHistory,
    isHost,
    isNavigatingAway: isNavigatingAwayRef.current,
    leave,
    endMeeting,
  };
}
