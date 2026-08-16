import { TranscriptSegment, transcriptSegment } from '@/reports/domain/entries/transcript-segment';
import { ChatEntry, chatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';

import { buildPrompt } from './summary-prompt';

/**
 * 프롬프트 한 줄에 붙는 메타데이터가 발화 본문만큼 길어 입력 토큰을 잡아먹는다.
 * 아래 스펙은 "무엇을 덜어냈는가"를 고정한다 — 발화 본문 자체는 손대지 않는다.
 */
describe('buildPrompt', () => {
  const startedAt = new Date('2026-05-21T10:00:00Z');
  const meta = {
    meetingId: '3f9a1c2e-8b4d-4f6a-9e21-7c5d0a8b1234',
    code: 'abc12xyz',
    startedAt,
    endedAt: new Date('2026-05-21T10:30:00Z'),
  };

  const build = (
    transcript: ReadonlyArray<TranscriptSegment>,
    chat: ReadonlyArray<ChatEntry> = [],
  ): string => buildPrompt({ transcript, chat, meta });

  const afterStart = (seconds: number): Date => new Date(startedAt.getTime() + seconds * 1000);

  it('발화 시각을 mm:ss로만 적고 종료 시각은 넣지 않는다', () => {
    const prompt = build([
      transcriptSegment({
        speaker: 'alice',
        text: 'OAuth 다음 분기 확정',
        startMs: 63_000,
        endMs: 70_000,
      }),
    ]);

    expect(prompt).toContain('[01:03]');
    expect(prompt).not.toContain('63000');
    expect(prompt).not.toContain('70000');
    expect(prompt).not.toContain('ms~');
  });

  it('한 시간이 넘어가면 분이 계속 누적된다', () => {
    const prompt = build([
      transcriptSegment({
        speaker: 'alice',
        text: '마무리하죠',
        startMs: 4_505_000,
        endMs: 4_510_000,
      }),
    ]);

    expect(prompt).toContain('[75:05]');
  });

  it('같은 화자의 연속 발화를 한 줄로 합친다', () => {
    const prompt = build([
      transcriptSegment({
        speaker: 'alice',
        text: '그건 다음 스프린트로',
        startMs: 0,
        endMs: 3_000,
      }),
      transcriptSegment({
        speaker: 'alice',
        text: '넘기는 게 좋겠어요',
        startMs: 3_000,
        endMs: 6_000,
      }),
    ]);

    const utterances = prompt.split('\n').filter((line) => line.includes('alice:'));
    expect(utterances).toHaveLength(1);
    expect(utterances[0]).toContain('그건 다음 스프린트로');
    expect(utterances[0]).toContain('넘기는 게 좋겠어요');
    // 합쳐진 줄의 시각은 첫 발화 기준이다.
    expect(utterances[0]).toContain('[00:00]');
  });

  it('화자가 바뀌면 줄을 나눈다', () => {
    const prompt = build([
      transcriptSegment({ speaker: 'alice', text: '어떻게 생각하세요', startMs: 0, endMs: 3_000 }),
      transcriptSegment({ speaker: 'bob', text: '동의합니다', startMs: 3_000, endMs: 5_000 }),
      transcriptSegment({
        speaker: 'alice',
        text: '그럼 그렇게 가죠',
        startMs: 5_000,
        endMs: 8_000,
      }),
    ]);

    const utterances = prompt.split('\n').filter((line) => /\[\d+:\d{2}\] (alice|bob):/.test(line));
    expect(utterances).toHaveLength(3);
  });

  it('speaker가 없는 발화는 unknown으로 적는다', () => {
    const prompt = build([transcriptSegment({ text: '누군가의 발화', startMs: 0, endMs: 2_000 })]);

    expect(prompt).toContain('unknown:');
  });

  it('채팅 시각을 회의 시작 기준 상대 시각으로 적는다', () => {
    const prompt = build(
      [],
      [chatEntry({ nickname: 'carol', text: '회의록 부탁드려요', sentAt: afterStart(90) })],
    );

    expect(prompt).toContain('[01:30] carol: 회의록 부탁드려요');
    expect(prompt).not.toContain('2026-05-21T10:01:30');
  });

  it('회의 시작 전에 온 채팅은 00:00으로 적는다', () => {
    const prompt = build(
      [],
      [chatEntry({ nickname: 'carol', text: '먼저 들어와 있어요', sentAt: afterStart(-120) })],
    );

    expect(prompt).toContain('[00:00] carol:');
  });

  it('요약에 쓰이지 않는 meetingId는 넣지 않는다', () => {
    const prompt = build([]);

    expect(prompt).not.toContain(meta.meetingId);
    expect(prompt).toContain(meta.code);
  });

  it('발화·채팅이 없어도 각 섹션을 유지한다', () => {
    const prompt = build([]);

    expect(prompt).toContain('(no utterances)');
    expect(prompt).toContain('(no chat)');
  });

  it('출력 구조 지시는 그대로 유지한다', () => {
    const prompt = build([]);

    expect(prompt).toContain('Output format');
    expect(prompt).toContain('Korean');
    expect(prompt).toContain('"keyTopics"');
  });
});
