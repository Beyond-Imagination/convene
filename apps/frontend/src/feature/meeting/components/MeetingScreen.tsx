'use client';

import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * 회의 화면의 dumb View.
 *
 * ARCHITECTURE §4.2 — useState/useEffect/fetch/socket 호출 금지. ViewModel hook
 * 반환을 그대로 prop 타입으로 받는다. v1 단계는 채팅/미디어 없이 참가자 목록과
 * 상태 표시만 다룬다.
 */
export interface MeetingScreenProps extends UseMeetingViewModel {
  readonly mediasoup: UseMediasoupViewModel;
}

export function MeetingScreen({
  code,
  status,
  nickname,
  remoteParticipants,
  errorMessage,
  leave,
}: MeetingScreenProps) {
  return (
    <main>
      <header>
        <h1>회의 {code}</h1>
        <p>내 닉네임: {nickname ?? '(미인증)'}</p>
        <button type="button" onClick={leave}>
          나가기
        </button>
      </header>
      {status === 'connecting' && (
        <p role="status" aria-live="polite">
          연결 중…
        </p>
      )}
      {status === 'error' && errorMessage !== null && (
        <p role="alert">연결 실패: {errorMessage}</p>
      )}
      <section aria-labelledby="participants-heading">
        <h2 id="participants-heading">참가자</h2>
        <ul>
          {nickname !== null && (
            <li data-testid="self-participant">{nickname} (나)</li>
          )}
          {remoteParticipants.map((p) => (
            <li key={p.socketId} data-testid="remote-participant">
              {p.nickname}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
