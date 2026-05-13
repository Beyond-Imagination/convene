import { keyTopic } from './key-topic';

describe('KeyTopic', () => {
  it('topic과 points를 trim 후 보존한다', () => {
    const t = keyTopic({ topic: '  Roadmap  ', points: ['  point a  ', 'point b'] });
    expect(t.topic).toBe('Roadmap');
    expect(t.points).toEqual(['point a', 'point b']);
  });

  it.each(['', '   '])('topic이 trim 후 비어 있으면 거부한다: "%s"', (topic) => {
    expect(() => keyTopic({ topic, points: ['x'] })).toThrow(/topic/);
  });

  it('topic이 200자를 넘으면 거부한다', () => {
    expect(() => keyTopic({ topic: 'a'.repeat(201), points: ['x'] })).toThrow(/topic/);
  });

  it('points 배열이 비어 있으면 거부한다', () => {
    expect(() => keyTopic({ topic: 'x', points: [] })).toThrow(/points/);
  });

  it('points 배열이 20개를 넘으면 거부한다', () => {
    const points = Array.from({ length: 21 }, (_, i) => `p${i}`);
    expect(() => keyTopic({ topic: 'x', points })).toThrow(/points/);
  });

  it.each(['', '   '])('points 항목이 trim 후 비어 있으면 거부한다: "%s"', (p) => {
    expect(() => keyTopic({ topic: 'x', points: ['ok', p] })).toThrow(/points\[1\]/);
  });

  it('points 항목이 500자를 넘으면 거부한다', () => {
    expect(() => keyTopic({ topic: 'x', points: ['a'.repeat(501)] })).toThrow(/points\[0\]/);
  });
});
