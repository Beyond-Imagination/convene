import { SystemClock } from './system.clock';

describe('SystemClock', () => {
  it('now()는 호출 시점의 Date를 돌려준다', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const at = clock.now();
    const after = Date.now();
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(after);
  });
});
