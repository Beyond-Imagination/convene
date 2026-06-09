import { AbsoluteTranscriptSegment } from '@/recording/domain/ports';

import { InMemoryPartialTranscriptStore } from './in-memory-partial-transcript.store';

const seg = (
  speaker: string,
  text: string,
  absoluteStartMs: number,
): AbsoluteTranscriptSegment => ({
  speaker,
  text,
  absoluteStartMs,
  absoluteEndMs: absoluteStartMs + 1000,
});

describe('InMemoryPartialTranscriptStore', () => {
  it('append 한 적 없는 회의는 consume이 빈 배열', async () => {
    const store = new InMemoryPartialTranscriptStore();
    expect(await store.consume('abc12xyz')).toEqual([]);
  });

  it('append 한 segments가 같은 순서로 consume 된다', async () => {
    const store = new InMemoryPartialTranscriptStore();
    await store.append('abc12xyz', [seg('s1', 'a', 100), seg('s2', 'b', 200)]);
    const result = await store.consume('abc12xyz');
    expect(result).toEqual([seg('s1', 'a', 100), seg('s2', 'b', 200)]);
  });

  it('여러 번 append 하면 시간순으로 누적된다', async () => {
    const store = new InMemoryPartialTranscriptStore();
    await store.append('abc12xyz', [seg('s1', 'a', 100)]);
    await store.append('abc12xyz', [seg('s2', 'b', 200), seg('s1', 'c', 300)]);
    const result = await store.consume('abc12xyz');
    expect(result).toEqual([seg('s1', 'a', 100), seg('s2', 'b', 200), seg('s1', 'c', 300)]);
  });

  it('consume 후 같은 code consume은 빈 배열(즉시 폐기)', async () => {
    const store = new InMemoryPartialTranscriptStore();
    await store.append('abc12xyz', [seg('s1', 'a', 100)]);
    await store.consume('abc12xyz');
    expect(await store.consume('abc12xyz')).toEqual([]);
  });

  it('서로 다른 회의의 segments는 독립적이다', async () => {
    const store = new InMemoryPartialTranscriptStore();
    await store.append('aaa11aaa', [seg('s1', 'a', 100)]);
    await store.append('bbb22bbb', [seg('s2', 'b', 200)]);
    const a = await store.consume('aaa11aaa');
    const b = await store.consume('bbb22bbb');
    expect(a).toEqual([seg('s1', 'a', 100)]);
    expect(b).toEqual([seg('s2', 'b', 200)]);
  });

  it('빈 segments 배열 append는 no-op', async () => {
    const store = new InMemoryPartialTranscriptStore();
    await store.append('abc12xyz', []);
    expect(await store.consume('abc12xyz')).toEqual([]);
  });
});
