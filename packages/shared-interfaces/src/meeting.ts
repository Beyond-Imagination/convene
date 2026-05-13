/**
 * Meeting bounded context의 HTTP wire format.
 *
 * 본 파일은 frontend ↔ backend가 공유하는 **순수 TS 인터페이스 / literal 타입**만
 * 정의한다. class-validator 데코레이터는 backend `dto/` 클래스가 본 인터페이스를
 * implements하면서 추가한다 (CLAUDE.md hard rule 2).
 */

export const SOURCES = ['web', 'notion-issue'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * 회의를 만들어낸 외부 시스템의 식별자.
 *   - v1.0.0: 항상 비어 있거나 미전송.
 *   - v2.0.0: 노션 이슈에서 회의가 생성될 때 `issueId`가 채워진다.
 */
export interface ExternalReferencePayload {
  issueId?: string;
}

export interface CreateMeetingRequest {
  source: Source;
  externalReference?: ExternalReferencePayload;
}

export interface CreateMeetingResponse {
  code: string;
  source: Source;
  startedAt: string;
}
