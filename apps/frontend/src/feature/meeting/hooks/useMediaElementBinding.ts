'use client';

import { type RefObject, useEffect } from 'react';

export interface UseMediaElementBindingParams<T extends HTMLMediaElement = HTMLMediaElement> {
  readonly ref: RefObject<T | null>;
  readonly stream: MediaStream | null;
  /** false 면 srcObject를 비우고 pause. default true. */
  readonly enabled?: boolean;
}

/**
 * video/audio 요소에 MediaStream을 attach + `.play()` 명시 호출까지 캡슐화하는 hook.
 */
export function useMediaElementBinding<T extends HTMLMediaElement = HTMLMediaElement>({
  ref,
  stream,
  enabled = true,
}: UseMediaElementBindingParams<T>): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;

    const tryPlay = (): void => {
      const result = el.play();
      if (result !== undefined && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch(() => {
          // autoplay 거부 등은 swallow. 사용자 첫 인터랙션 후 다시 시도되도록 둔다.
        });
      }
    };
    const onLoadedData = (): void => tryPlay();
    // 모바일은 앱 전환 시 재생을 멈추고, 돌아와도 스스로 재개하지 않는다(검은 화면).
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && el.paused) tryPlay();
    };

    if (stream === null || !enabled) {
      el.removeEventListener('loadeddata', onLoadedData);
      if (el.srcObject !== null) {
        el.pause();
        el.srcObject = null;
      }
      return () => {
        el.removeEventListener('loadeddata', onLoadedData);
      };
    }

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.addEventListener('loadeddata', onLoadedData);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // 이미 데이터가 준비됐다면(예: 재사용된 stream) 즉시 play() 시도.
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    }

    return () => {
      el.removeEventListener('loadeddata', onLoadedData);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [ref, stream, enabled]);
}
