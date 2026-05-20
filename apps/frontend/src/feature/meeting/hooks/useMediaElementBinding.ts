'use client';

import type { RefObject } from 'react';

/**
 * video/audio 요소에 MediaStream 을 attach + `.play()` 명시 호출까지 캡슐화하는 hook
 * — spec 단계 stub. 실제 구현은 후속 커밋.
 *
 * 함정 해결 대상(plum useVideoElementBinding):
 *  - autoplay 정책 회피: `loadeddata` 이벤트 후 `el.play()` 명시 호출 + catch swallow
 *  - srcObject 변경 idempotent (같은 stream 재할당 X)
 *  - stream null / enabled=false 시 pause + srcObject=null
 *  - unmount 시 listener 제거
 */
export interface UseMediaElementBindingParams<T extends HTMLMediaElement = HTMLMediaElement> {
  readonly ref: RefObject<T | null>;
  readonly stream: MediaStream | null;
  readonly enabled?: boolean;
}

export function useMediaElementBinding<T extends HTMLMediaElement = HTMLMediaElement>(
  _params: UseMediaElementBindingParams<T>,
): void {
  throw new Error('not implemented');
}
