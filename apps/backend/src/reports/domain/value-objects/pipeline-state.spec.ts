import { PipelineState } from './pipeline-state';

describe('PipelineState', () => {
  const at1 = new Date('2026-01-01T00:00:00Z');
  const at2 = new Date('2026-01-01T00:00:10Z');

  describe('initial', () => {
    it('두 stage 모두 pending, failures 비어 있음', () => {
      const s = PipelineState.initial();
      expect(s.sttStatus).toBe('pending');
      expect(s.summaryStatus).toBe('pending');
      expect(s.failures).toEqual([]);
      expect(s.isFinal).toBe(false);
      expect(s.isDone).toBe(false);
    });
  });

  describe('markTranscriptionDone', () => {
    it('pending → done 전이', () => {
      const s = PipelineState.initial().markTranscriptionDone();
      expect(s.sttStatus).toBe('done');
    });

    it('이미 done인 stage 재전이는 거부', () => {
      const s = PipelineState.initial().markTranscriptionDone();
      expect(() => s.markTranscriptionDone()).toThrow(/already/);
    });

    it('이미 failed인 stage 재전이는 거부', () => {
      const s = PipelineState.initial().markTranscriptionFailed('boom', at1);
      expect(() => s.markTranscriptionDone()).toThrow(/already/);
    });
  });

  describe('markTranscriptionFailed', () => {
    it('failure를 추가하고 status를 failed로 전이', () => {
      const s = PipelineState.initial().markTranscriptionFailed('boom', at1);
      expect(s.sttStatus).toBe('failed');
      expect(s.failures).toEqual([{ stage: 'stt', error: 'boom', at: at1 }]);
    });

    it('error가 trim 후 비어 있으면 거부', () => {
      expect(() => PipelineState.initial().markTranscriptionFailed('   ', at1)).toThrow(/error/);
    });

    it('error가 1000자를 넘으면 거부', () => {
      expect(() =>
        PipelineState.initial().markTranscriptionFailed('a'.repeat(1001), at1),
      ).toThrow(/error/);
    });
  });

  describe('summary stage', () => {
    it('두 stage가 독립적으로 done이면 isDone=true, isFinal=true', () => {
      const s = PipelineState.initial().markTranscriptionDone().markSummaryDone();
      expect(s.sttStatus).toBe('done');
      expect(s.summaryStatus).toBe('done');
      expect(s.isDone).toBe(true);
      expect(s.isFinal).toBe(true);
    });

    it('두 stage 모두 failed면 failures가 stage별로 누적된다', () => {
      const s = PipelineState.initial()
        .markTranscriptionFailed('stt boom', at1)
        .markSummaryFailed('llm boom', at2);
      expect(s.failures).toEqual([
        { stage: 'stt', error: 'stt boom', at: at1 },
        { stage: 'summary', error: 'llm boom', at: at2 },
      ]);
      expect(s.isFinal).toBe(true);
      expect(s.isDone).toBe(false);
    });

    it('이미 done/failed인 summary stage 재전이는 거부', () => {
      const s = PipelineState.initial().markSummaryDone();
      expect(() => s.markSummaryFailed('x', at1)).toThrow(/already/);
    });
  });

  describe('resummarizeDone (관리자 재요약)', () => {
    it('failed 였던 summary 를 done 으로 덮어쓰고 기존 failures 는 보존한다', () => {
      const s = PipelineState.initial()
        .markTranscriptionDone()
        .markSummaryFailed('llm boom', at1)
        .resummarizeDone();
      expect(s.sttStatus).toBe('done');
      expect(s.summaryStatus).toBe('done');
      expect(s.failures).toEqual([{ stage: 'summary', error: 'llm boom', at: at1 }]);
      expect(s.isDone).toBe(true);
    });

    it('done 이던 summary 도 다시 done 으로 덮어쓸 수 있다(새 프롬프트 재요약)', () => {
      const s = PipelineState.initial()
        .markTranscriptionDone()
        .markSummaryDone()
        .resummarizeDone();
      expect(s.summaryStatus).toBe('done');
    });

    it('summary 가 아직 pending 이면 재요약 전이를 거부한다', () => {
      const s = PipelineState.initial().markTranscriptionDone();
      expect(() => s.resummarizeDone()).toThrow(/pending/);
    });

    it('새 인스턴스를 반환하고 원본은 유지된다(immutable)', () => {
      const a = PipelineState.initial().markTranscriptionDone().markSummaryFailed('boom', at1);
      const b = a.resummarizeDone();
      expect(a.summaryStatus).toBe('failed');
      expect(b.summaryStatus).toBe('done');
      expect(a).not.toBe(b);
    });
  });

  describe('immutability', () => {
    it('전이 메서드는 새 인스턴스를 반환하고 원본은 유지된다', () => {
      const a = PipelineState.initial();
      const b = a.markTranscriptionDone();
      expect(a.sttStatus).toBe('pending');
      expect(b.sttStatus).toBe('done');
      expect(a).not.toBe(b);
    });
  });

  describe('isFinal', () => {
    it('한 stage라도 pending이면 false', () => {
      const s = PipelineState.initial().markTranscriptionDone();
      expect(s.isFinal).toBe(false);
    });

    it('한 stage done + 한 stage failed면 finalize 가능, 단 isDone=false', () => {
      const s = PipelineState.initial()
        .markTranscriptionDone()
        .markSummaryFailed('err', at1);
      expect(s.isFinal).toBe(true);
      expect(s.isDone).toBe(false);
    });
  });

  describe('fromSnapshot (복원)', () => {
    it('initial 상태와 동등한 snapshot 으로부터 복원하면 같은 동작', () => {
      const restored = PipelineState.fromSnapshot({
        sttStatus: 'pending',
        summaryStatus: 'pending',
        failures: [],
      });
      expect(restored.sttStatus).toBe('pending');
      expect(restored.summaryStatus).toBe('pending');
      expect(restored.failures).toEqual([]);
      expect(restored.isFinal).toBe(false);
    });

    it('done + failed 가 섞인 상태도 그대로 복원하고 재전이를 거부한다', () => {
      const restored = PipelineState.fromSnapshot({
        sttStatus: 'done',
        summaryStatus: 'failed',
        failures: [{ stage: 'summary', error: 'llm boom', at: at1 }],
      });
      expect(restored.sttStatus).toBe('done');
      expect(restored.summaryStatus).toBe('failed');
      expect(restored.isFinal).toBe(true);
      expect(() => restored.markSummaryDone()).toThrow(/already/);
    });
  });
});
