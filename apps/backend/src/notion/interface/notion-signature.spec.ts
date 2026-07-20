import { NotionSignatureVerifier, signIssue, verifyIssueSignature } from '@/notion/interface/notion-signature';

describe('signIssue / verifyIssueSignature', () => {
  it('signIssue로 만든 서명은 같은 secret·issueId에서 검증을 통과한다', () => {
    const sig = signIssue('s3cr3t', 'issue-1');
    expect(verifyIssueSignature('s3cr3t', 'issue-1', sig)).toBe(true);
  });

  it('secret이 다르면 검증에 실패한다', () => {
    const sig = signIssue('s3cr3t', 'issue-1');
    expect(verifyIssueSignature('other', 'issue-1', sig)).toBe(false);
  });

  it('issueId가 다르면 검증에 실패한다(다른 이슈 서명 재사용 차단)', () => {
    const sig = signIssue('s3cr3t', 'issue-1');
    expect(verifyIssueSignature('s3cr3t', 'issue-2', sig)).toBe(false);
  });

  it('길이가 다른 위조 서명도 안전하게 false', () => {
    expect(verifyIssueSignature('s3cr3t', 'issue-1', 'deadbeef')).toBe(false);
  });

  it('NotionSignatureVerifier는 secret을 품고 검증만 노출한다', () => {
    const verifier = new NotionSignatureVerifier('s3cr3t');
    expect(verifier.verify('issue-1', signIssue('s3cr3t', 'issue-1'))).toBe(true);
    expect(verifier.verify('issue-1', 'nope')).toBe(false);
  });
});
