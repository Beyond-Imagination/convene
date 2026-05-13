/**
 * 회의 생성 출처.
 *   - 'web'          v1.0.0 기본 경로(사용자가 웹에서 직접 회의 생성).
 *   - 'notion-issue' v2.0.0에서 추가될 경로(노션 이슈에서 트리거).
 *
 * literal union VO로 두면 v2에서 새 source 분기를 추가할 때 컴파일 타임에
 * 누락된 처리 지점이 강제로 드러난다.
 */
export const SOURCES = ['web', 'notion-issue'] as const;
export type Source = (typeof SOURCES)[number];

export function asSource(raw: string): Source {
  if (!(SOURCES as readonly string[]).includes(raw)) {
    throw new Error(`Source must be one of [${SOURCES.join(', ')}], got "${raw}"`);
  }
  return raw as Source;
}
