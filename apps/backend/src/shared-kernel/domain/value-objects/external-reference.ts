/**
 * 회의를 만들어낸 외부 시스템의 식별자.
 *
 * v1.0.0: 항상 비어 있음(`{}`).
 * v2.0.0: 노션 연동에서 이슈로부터 회의가 생성될 때 `issueId`가 채워진다.
 *         회의 종료 시 노션 어댑터가 이 값을 보고 해당 이슈에 회의록을 push한다.
 */
export interface ExternalReference {
  readonly issueId?: string;
}

export const NO_EXTERNAL_REFERENCE: ExternalReference = Object.freeze({});

export function externalReference(input: { issueId?: string } = {}): ExternalReference {
  if (input.issueId !== undefined && input.issueId.trim() === '') {
    throw new Error('ExternalReference.issueId must be non-empty when provided');
  }
  return input.issueId === undefined ? NO_EXTERNAL_REFERENCE : { issueId: input.issueId };
}
