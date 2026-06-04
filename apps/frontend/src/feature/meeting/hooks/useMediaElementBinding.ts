'use client';

import { type RefObject, useEffect } from 'react';

/**
 * video/audio 요소에 MediaStream 을 attach + `.play()` 명시 호출까지 캡슐화하는 hook.
 * 검은 화면/화면 공유 미표시의 핵심 원인이었던 다음 함정을 모두 해결:
 *
 *   1. **autoplay 정책 회피**: Chrome/Safari 는 stream 부착 직후 autoPlay 속성만으로는
 *      재생을 보장하지 않는다(특히 audio 가 포함되거나 mediasoup consumer 처럼 트랙이
 *      나중에 도착하는 케이스). `loadeddata` 이벤트 후 `.play()` 를 **명시 호출**한다.
 *   2. **promise reject swallow**: `.play()` 는 NotAllowedError 등으로 reject 될 수
 *      있어 catch 로 받아 swallow(컴포넌트로 throw 안 함).
 *   3. **srcObject idempotent**: 같은 stream 을 다시 set 하지 않아 무한 re-attach 방지.
 *   4. **enabled=false / stream=null 시 정리**: pause + srcObject=null + listener 제거.
 *
 * View 컴포넌트(LocalVideoTile/RemoteVideoTile/ScreenTile) 가 본 hook 을 호출해
 * dumb View 원칙을 유지하면서도 함정 해결 로직을 캡슐화한다.
 */
export interface UseMediaElementBindingParams<T extends HTMLMediaElement = HTMLMediaElement> {
  readonly ref: RefObject<T | null>;
  readonly stream: MediaStream | null;
  /** false 면 srcObject 를 비우고 pause. default true. */
  readonly enabled?: boolean;
}

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
    // 이미 데이터가 준비됐다면(예: 재사용된 stream) 즉시 play() 시도.
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    }

    return () => {
      el.removeEventListener('loadeddata', onLoadedData);
    };
  }, [ref, stream, enabled]);
}
