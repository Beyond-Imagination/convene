import { transcriptSegment } from './transcript-segment';

describe('TranscriptSegment', () => {
  it('정상 입력으로 segment를 생성한다 (speaker 생략 가능)', () => {
    const s = transcriptSegment({ text: 'hello world', startMs: 0, endMs: 1500 });
    expect(s.text).toBe('hello world');
    expect(s.startMs).toBe(0);
    expect(s.endMs).toBe(1500);
    expect(s.speaker).toBeUndefined();
  });

  it('speaker가 주어지면 trim 후 보존한다', () => {
    const s = transcriptSegment({
      speaker: '  alice  ',
      text: 'hi',
      startMs: 0,
      endMs: 100,
    });
    expect(s.speaker).toBe('alice');
  });

  it.each(['', '   '])('text가 trim 후 비어 있으면 거부한다: "%s"', (t) => {
    expect(() => transcriptSegment({ text: t, startMs: 0, endMs: 100 })).toThrow(/text/);
  });

  it('text가 5000자를 넘으면 거부한다', () => {
    expect(() =>
      transcriptSegment({ text: 'a'.repeat(5001), startMs: 0, endMs: 100 }),
    ).toThrow(/text/);
  });

  it.each([-1, 1.5, NaN, Infinity])(
    'startMs가 음수·정수 아니면 거부한다: %s',
    (startMs) => {
      expect(() => transcriptSegment({ text: 'hi', startMs, endMs: 100 })).toThrow(/startMs/);
    },
  );

  it('endMs가 startMs보다 작으면 거부한다', () => {
    expect(() => transcriptSegment({ text: 'hi', startMs: 100, endMs: 50 })).toThrow(/endMs/);
  });

  it('endMs == startMs는 허용한다(0ms 구간)', () => {
    const s = transcriptSegment({ text: 'hi', startMs: 100, endMs: 100 });
    expect(s.endMs).toBe(100);
  });

  it('speaker가 trim 후 빈 문자열이면 거부한다', () => {
    expect(() =>
      transcriptSegment({ speaker: '   ', text: 'hi', startMs: 0, endMs: 100 }),
    ).toThrow(/speaker/);
  });
});
