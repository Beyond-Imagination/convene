'use client';

import { LocalVideoTile } from '@/feature/meeting/components/LocalVideoTile';
import { RemoteAudioPlayer } from '@/feature/meeting/components/RemoteAudioPlayer';
import { RemoteVideoTile } from '@/feature/meeting/components/RemoteVideoTile';
import {
  LocalScreenTile,
  RemoteScreenTile,
} from '@/feature/meeting/components/ScreenTile';
import type {
  RemoteMediaEntry,
  UseMediasoupViewModel,
} from '@/feature/meeting/hooks/useMediasoupViewModel';
import type { UseMeetingViewModel } from '@/feature/meeting/hooks/useMeetingViewModel';

/**
 * 회의 화면의 dumb View.
 *
 * ARCHITECTURE §4.2 — useState/useEffect/fetch/socket 호출 금지. ViewModel hook
 * 반환을 그대로 prop 타입으로 받는다. self + remote video tile 의 srcObject
 * attach 는 각 tile 컴포넌트의 ref callback 에서 처리.
 */
export interface MeetingScreenProps extends UseMeetingViewModel {
  readonly mediasoup: UseMediasoupViewModel;
}

const pickTrack = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
  kind: 'audio' | 'video',
): MediaStreamTrack | null => {
  for (const m of remoteMedia) {
    if (
      m.peerSocketId === peerSocketId &&
      m.kind === kind &&
      m.source !== 'screen'
    ) {
      return m.track;
    }
  }
  return null;
};

const pickScreenTrack = (
  remoteMedia: ReadonlyArray<RemoteMediaEntry>,
  peerSocketId: string,
): MediaStreamTrack | null => {
  for (const m of remoteMedia) {
    if (m.peerSocketId === peerSocketId && m.source === 'screen') return m.track;
  }
  return null;
};

export function MeetingScreen({
  code,
  status,
  nickname,
  remoteParticipants,
  errorMessage,
  leave,
  mediasoup,
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
      {(mediasoup.status === 'idle' || mediasoup.status === 'preparing') && (
        <p
          role="status"
          aria-live="polite"
          data-testid="mediasoup-status"
        >
          미디어 준비 중…
        </p>
      )}
      {mediasoup.status === 'error' && mediasoup.errorMessage !== null && (
        <p role="alert">미디어 오류: {mediasoup.errorMessage}</p>
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
      <section aria-labelledby="video-tiles-heading">
        <h2 id="video-tiles-heading">비디오</h2>
        <LocalVideoTile nickname={nickname} stream={mediasoup.localStream} />
        {remoteParticipants.map((p) => (
          <RemoteVideoTile
            key={p.socketId}
            participant={p}
            videoTrack={pickTrack(mediasoup.remoteMedia, p.socketId, 'video')}
          />
        ))}
      </section>
      {/* 원격 audio 는 video 와 분리된 별도 `<audio>` 요소로 재생 (plum 패턴) */}
      <RemoteAudioPlayer remoteMedia={mediasoup.remoteMedia} />
      <section aria-labelledby="screen-share-heading">
        <h2 id="screen-share-heading">화면 공유</h2>
        {mediasoup.isSharingScreen ? (
          <button type="button" onClick={mediasoup.stopScreenShare}>
            공유 중지
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void mediasoup.startScreenShare()}
          >
            화면 공유 시작
          </button>
        )}
        {mediasoup.isSharingScreen && mediasoup.screenStream !== null && (
          <LocalScreenTile stream={mediasoup.screenStream} />
        )}
        {remoteParticipants.map((p) => {
          const track = pickScreenTrack(mediasoup.remoteMedia, p.socketId);
          if (track === null) return null;
          return (
            <RemoteScreenTile
              key={`screen-${p.socketId}`}
              nickname={p.nickname}
              track={track}
            />
          );
        })}
      </section>
    </main>
  );
}
