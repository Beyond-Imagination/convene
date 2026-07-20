import { createHmac, timingSafeEqual } from 'node:crypto';

// 노션 버튼 URL에 미리 박아 둘 sig를 생성할 때도 쓴다.
export function signIssue(secret: string, issueId: string): string {
  return createHmac('sha256', secret).update(issueId).digest('hex');
}

export function verifyIssueSignature(secret: string, issueId: string, sig: string): boolean {
  // 런타임에 sig가 string이 아니면(undefined 등) Buffer.from이 던진다. 방어적으로 차단.
  if (typeof sig !== 'string' || typeof issueId !== 'string') return false;
  const expected = Buffer.from(signIssue(secret, issueId));
  const provided = Buffer.from(sig);
  // timingSafeEqual은 길이가 같아야 하며, 상수시간 비교로 타이밍 누출을 막는다.
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export class NotionSignatureVerifier {
  constructor(private readonly secret: string) {}

  verify(issueId: string, sig: string): boolean {
    return verifyIssueSignature(this.secret, issueId, sig);
  }
}
