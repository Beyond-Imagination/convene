import { actionItem } from './action-item';

describe('ActionItem', () => {
  it('task만으로 생성한다', () => {
    const a = actionItem({ task: 'Send proposal' });
    expect(a.task).toBe('Send proposal');
    expect(a.owner).toBeUndefined();
    expect(a.due).toBeUndefined();
  });

  it('owner와 due가 주어지면 trim 후 보존한다', () => {
    const a = actionItem({ owner: '  alice  ', task: 'do x', due: '  2026-02-01  ' });
    expect(a.owner).toBe('alice');
    expect(a.due).toBe('2026-02-01');
  });

  it.each(['', '   '])('task가 trim 후 비어 있으면 거부한다: "%s"', (t) => {
    expect(() => actionItem({ task: t })).toThrow(/task/);
  });

  it('task가 500자를 넘으면 거부한다', () => {
    expect(() => actionItem({ task: 'a'.repeat(501) })).toThrow(/task/);
  });

  it.each(['', '   '])('owner가 제공됐는데 trim 후 비어 있으면 거부한다: "%s"', (o) => {
    expect(() => actionItem({ task: 'do x', owner: o })).toThrow(/owner/);
  });

  it('owner가 50자를 넘으면 거부한다', () => {
    expect(() => actionItem({ task: 'do x', owner: 'a'.repeat(51) })).toThrow(/owner/);
  });

  it.each(['', '   '])('due가 제공됐는데 trim 후 비어 있으면 거부한다: "%s"', (d) => {
    expect(() => actionItem({ task: 'do x', due: d })).toThrow(/due/);
  });

  it('due가 100자를 넘으면 거부한다', () => {
    expect(() => actionItem({ task: 'do x', due: 'a'.repeat(101) })).toThrow(/due/);
  });
});
