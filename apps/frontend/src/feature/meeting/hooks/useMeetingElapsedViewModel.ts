'use client';

import { useEffect, useState } from 'react';

const pad = (n: number): string => String(n).padStart(2, '0');

const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

export interface UseMeetingElapsedViewModel {
  /** `HH:MM:SS`. 시작 시각을 모르는 동안과 알 수 없을 때는 null. */
  readonly elapsed: string | null;
}

/**
 * 회의가 열린 뒤 흐른 시간.
 *
 * 기준은 서버가 알려 준 방이 열린 시각이다. 내 입장 시각으로 대신하면
 * 새로고침·재접속마다 0으로 돌아가 회의 길이와 어긋난다.
 */
export function useMeetingElapsedViewModel(startedAt: string | null): UseMeetingElapsedViewModel {
  const [now, setNow] = useState(() => Date.now());
  const startedMs = startedAt === null ? NaN : Date.parse(startedAt);
  const isKnown = !Number.isNaN(startedMs);

  useEffect(() => {
    if (!isKnown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isKnown]);

  return { elapsed: isKnown ? formatElapsed(Math.max(0, now - startedMs)) : null };
}
