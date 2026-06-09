import { beforeEach, describe, expect, it } from 'vitest';

import { getHostToken, saveHostToken } from './host-token.storage';

describe('host-token storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('회의 code로 저장한 hostToken을 그대로 조회한다', () => {
    saveHostToken('abc12xyz', 'tok-1');
    expect(getHostToken('abc12xyz')).toBe('tok-1');
  });

  it('저장하지 않은 code는 null을 돌려준다', () => {
    expect(getHostToken('zzz99zzz')).toBeNull();
  });

  it('회의별로 분리 저장된다', () => {
    saveHostToken('aaaaaaaa', 'tok-a');
    saveHostToken('bbbbbbbb', 'tok-b');
    expect(getHostToken('aaaaaaaa')).toBe('tok-a');
    expect(getHostToken('bbbbbbbb')).toBe('tok-b');
  });
});
