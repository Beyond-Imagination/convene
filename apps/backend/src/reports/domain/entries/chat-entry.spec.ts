import { chatEntry } from './chat-entry';

describe('ChatEntry', () => {
  const at = new Date('2026-01-01T00:00:00Z');

  it('정상 입력은 trim 후 ChatEntry를 반환한다', () => {
    const e = chatEntry({ nickname: '  alice  ', text: '  hello  ', sentAt: at });
    expect(e.nickname).toBe('alice');
    expect(e.text).toBe('hello');
    expect(e.sentAt).toBe(at);
  });

  it.each(['', '   '])('nickname이 trim 후 비어 있으면 거부한다: "%s"', (n) => {
    expect(() => chatEntry({ nickname: n, text: 'hi', sentAt: at })).toThrow(/nickname/);
  });

  it('nickname이 30자를 넘으면 거부한다', () => {
    expect(() => chatEntry({ nickname: 'a'.repeat(31), text: 'hi', sentAt: at })).toThrow(/nickname/);
  });

  it.each(['', '   '])('text가 trim 후 비어 있으면 거부한다: "%s"', (t) => {
    expect(() => chatEntry({ nickname: 'alice', text: t, sentAt: at })).toThrow(/text/);
  });

  it('text가 2000자를 넘으면 거부한다', () => {
    expect(() =>
      chatEntry({ nickname: 'alice', text: 'a'.repeat(2001), sentAt: at }),
    ).toThrow(/text/);
  });
});
