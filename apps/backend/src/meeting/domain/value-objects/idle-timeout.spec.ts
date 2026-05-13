import { IdleTimeout } from './idle-timeout';

describe('IdleTimeout', () => {
  it('기본값은 10분(600_000 ms)', () => {
    expect(IdleTimeout.DEFAULT_MS).toBe(10 * 60 * 1000);
    expect(IdleTimeout.default().milliseconds).toBe(600_000);
  });

  it('of()는 양의 정수 ms를 허용한다', () => {
    expect(IdleTimeout.of(1).milliseconds).toBe(1);
    expect(IdleTimeout.of(5000).milliseconds).toBe(5000);
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])('of()는 %s를 거부한다', (ms) => {
    expect(() => IdleTimeout.of(ms)).toThrow(/IdleTimeout/);
  });

  it('equals는 값으로 비교한다', () => {
    const a = IdleTimeout.of(1000);
    const b = IdleTimeout.of(1000);
    const c = IdleTimeout.of(2000);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
