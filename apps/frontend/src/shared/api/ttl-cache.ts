export interface TtlCache<T> {
  /** 살아 있는 항목이 있으면 그대로 주고, 없을 때만 loader를 부른다. */
  fetch(key: string, loader: () => Promise<T>): Promise<T>;
  /** key를 주면 그 항목만, 없으면 전부 버린다. */
  invalidate(key?: string): void;
}

interface Entry<T> {
  readonly expiresAt: number;
  readonly value: Promise<T>;
}

/**
 * 키별 TTL 캐시.
 *
 * 결과가 아니라 Promise를 담아 두므로 아직 끝나지 않은 같은 요청도 하나로 합쳐진다.
 * 실패한 요청은 남기지 않는다 — 에러가 TTL 동안 굳으면 복구할 방법이 없다.
 */
export function ttlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    fetch(key, loader) {
      const hit = entries.get(key);
      if (hit !== undefined && hit.expiresAt > now()) return hit.value;

      const value = loader();
      entries.set(key, { expiresAt: now() + ttlMs, value });
      void value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },

    invalidate(key) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
  };
}
