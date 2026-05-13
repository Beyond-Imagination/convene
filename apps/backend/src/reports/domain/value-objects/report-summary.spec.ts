import { reportSummary } from './report-summary';

describe('ReportSummary', () => {
  const valid = {
    title: '주간 회의',
    overview: '이번 주 마일스톤 점검과 다음 스프린트 일정 논의.',
    decisions: ['A안 채택'],
    actionItems: [{ owner: 'alice', task: 'PRD 초안 작성', due: '2026-02-01' }],
    keyTopics: [{ topic: 'Roadmap', points: ['Q1 목표', 'Q2 일정'] }],
  };

  it('정상 입력으로 요약을 생성한다', () => {
    const s = reportSummary(valid);
    expect(s.title).toBe('주간 회의');
    expect(s.overview).toContain('마일스톤');
    expect(s.decisions).toEqual(['A안 채택']);
    expect(s.actionItems).toHaveLength(1);
    expect(s.keyTopics).toHaveLength(1);
  });

  it('decisions·actionItems·keyTopics는 모두 비어 있어도 유효하다', () => {
    const s = reportSummary({
      title: 't',
      overview: 'o',
      decisions: [],
      actionItems: [],
      keyTopics: [],
    });
    expect(s.decisions).toEqual([]);
    expect(s.actionItems).toEqual([]);
    expect(s.keyTopics).toEqual([]);
  });

  it.each(['', '   '])('title이 trim 후 비어 있으면 거부한다: "%s"', (t) => {
    expect(() => reportSummary({ ...valid, title: t })).toThrow(/title/);
  });

  it('title이 200자를 넘으면 거부한다', () => {
    expect(() => reportSummary({ ...valid, title: 'a'.repeat(201) })).toThrow(/title/);
  });

  it.each(['', '   '])('overview가 trim 후 비어 있으면 거부한다: "%s"', (o) => {
    expect(() => reportSummary({ ...valid, overview: o })).toThrow(/overview/);
  });

  it('overview가 1000자를 넘으면 거부한다', () => {
    expect(() => reportSummary({ ...valid, overview: 'a'.repeat(1001) })).toThrow(/overview/);
  });

  it.each(['', '   '])('decisions 항목이 trim 후 비어 있으면 거부한다: "%s"', (d) => {
    expect(() => reportSummary({ ...valid, decisions: [d] })).toThrow(/decisions\[0\]/);
  });

  it('decisions가 50개를 넘으면 거부한다', () => {
    const decisions = Array.from({ length: 51 }, (_, i) => `d${i}`);
    expect(() => reportSummary({ ...valid, decisions })).toThrow(/decisions/);
  });

  it('actionItem 검증은 actionItem factory에 위임된다(task 빈 값 거부)', () => {
    expect(() => reportSummary({ ...valid, actionItems: [{ task: '' }] })).toThrow(/task/);
  });

  it('keyTopic 검증은 keyTopic factory에 위임된다(topic 빈 값 거부)', () => {
    expect(() =>
      reportSummary({ ...valid, keyTopics: [{ topic: '', points: ['p'] }] }),
    ).toThrow(/topic/);
  });
});
