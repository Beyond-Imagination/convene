import { MeetingCode } from './meeting-code';

describe('MeetingCode', () => {
  it('8자 소문자 영숫자 값을 허용한다', () => {
    const c = MeetingCode.from('abc12xyz');
    expect(c.value).toBe('abc12xyz');
    expect(c.toString()).toBe('abc12xyz');
  });

  it.each(['abc', 'abc12xyz9', ''])('길이가 다르면 거부한다: "%s"', (raw) => {
    expect(() => MeetingCode.from(raw)).toThrow(/MeetingCode/);
  });

  it.each(['ABC12xyz', 'abc 12xy', 'abc-12xy', 'abc12xy!'])(
    '소문자 영숫자가 아니면 거부한다: "%s"',
    (raw) => {
      expect(() => MeetingCode.from(raw)).toThrow(/MeetingCode/);
    },
  );

  it('equals는 참조가 아닌 값으로 비교한다', () => {
    const a = MeetingCode.from('abc12xyz');
    const b = MeetingCode.from('abc12xyz');
    const c = MeetingCode.from('xyz12abc');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
