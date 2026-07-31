'use client';

export type EmbedGateStatus = 'checking' | 'embedded' | 'standalone';

export interface UseEmbedGateViewModel {
  /** 판정 전에는 checking — 정적 export라 첫 렌더 시점엔 window를 읽을 수 없다. */
  readonly status: EmbedGateStatus;
  /** 새 탭으로 열 주소. 판정 전에는 빈 문자열. */
  readonly pageUrl: string;
}

export function useEmbedGateViewModel(): UseEmbedGateViewModel {
  throw new Error('not implemented');
}
