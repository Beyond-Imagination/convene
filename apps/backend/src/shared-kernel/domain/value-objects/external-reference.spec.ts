import { externalReference, NO_EXTERNAL_REFERENCE } from './external-reference';

describe('ExternalReference', () => {
  it('입력이 없으면 NO_EXTERNAL_REFERENCE 싱글톤을 반환한다', () => {
    expect(externalReference()).toBe(NO_EXTERNAL_REFERENCE);
    expect(externalReference({})).toBe(NO_EXTERNAL_REFERENCE);
  });

  it('NO_EXTERNAL_REFERENCE는 frozen이라 실수로 변경되지 않는다', () => {
    expect(Object.isFrozen(NO_EXTERNAL_REFERENCE)).toBe(true);
  });

  it('issueId가 주어지면 그대로 보존한다', () => {
    const ref = externalReference({ issueId: 'NTN-42' });
    expect(ref.issueId).toBe('NTN-42');
  });

  it('빈 문자열·공백뿐인 issueId는 거부한다', () => {
    expect(() => externalReference({ issueId: '' })).toThrow(/issueId/);
    expect(() => externalReference({ issueId: '   ' })).toThrow(/issueId/);
  });
});
