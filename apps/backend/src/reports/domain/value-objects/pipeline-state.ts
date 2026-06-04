/**
 * MeetingReport의 후처리 파이프라인 상태.
 *
 * 두 stage(STT, Summary)가 독립적으로 `pending → done | failed` 한 방향 전이를
 * 한 번씩만 수행한다. done/failed에 도달하면 다시 pending으로 돌아갈 수 없다.
 *
 * VO이므로 모든 전이 메서드는 새 인스턴스를 반환한다(immutable).
 * Aggregate(MeetingReport)는 인스턴스를 교체하는 방식으로 상태를 진행시킨다.
 *
 * 상태 전이 다이어그램: ARCHITECTURE.md §5.
 */

export const PIPELINE_STAGE_STATUSES = ['pending', 'done', 'failed'] as const;
export type PipelineStageStatus = (typeof PIPELINE_STAGE_STATUSES)[number];

export const PIPELINE_STAGES = ['stt', 'summary'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PipelineFailure {
  readonly stage: PipelineStage;
  readonly error: string;
  readonly at: Date;
}

const ERROR_MAX = 1000;

export class PipelineState {
  private constructor(
    public readonly sttStatus: PipelineStageStatus,
    public readonly summaryStatus: PipelineStageStatus,
    public readonly failures: ReadonlyArray<PipelineFailure>,
  ) {}

  static initial(): PipelineState {
    return new PipelineState('pending', 'pending', []);
  }

  /**
   * 영속 저장소(Mongo 등) 의 wire object 로부터 PipelineState 를 복원한다.
   *
   * 입력은 신뢰 가능한 snapshot 이라는 trust 하에 형식 검증은 생략한다
   * (검증 책임은 snapshot 생성 시점에 있다).
   */
  static fromSnapshot(input: {
    sttStatus: PipelineStageStatus;
    summaryStatus: PipelineStageStatus;
    failures: ReadonlyArray<PipelineFailure>;
  }): PipelineState {
    return new PipelineState(input.sttStatus, input.summaryStatus, [...input.failures]);
  }

  markTranscriptionDone(): PipelineState {
    this.assertPending('stt');
    return new PipelineState('done', this.summaryStatus, this.failures);
  }

  markTranscriptionFailed(error: string, at: Date): PipelineState {
    this.assertPending('stt');
    return new PipelineState(
      'failed',
      this.summaryStatus,
      this.appendFailure('stt', error, at),
    );
  }

  markSummaryDone(): PipelineState {
    this.assertPending('summary');
    return new PipelineState(this.sttStatus, 'done', this.failures);
  }

  markSummaryFailed(error: string, at: Date): PipelineState {
    this.assertPending('summary');
    return new PipelineState(
      this.sttStatus,
      'failed',
      this.appendFailure('summary', error, at),
    );
  }

  /**
   * 이미 끝난(done/failed) summary stage 를 새 요약 성공 결과로 덮어쓴다.
   *
   * 관리자 재요약(`POST /reports/:id/resummarize`) 전용 전이. 중간 pending 을
   * 거치지 않고 한 번에 done 으로 교체하므로, 재요약 도중 크래시가 나도 회의록이
   * 영구 pending 으로 갇히지 않는다. 아직 1차 요약이 끝나지 않은(pending) stage 는
   * 재요약 대상이 아니므로 거부한다. 누적 failures 는 보존.
   *
   * 재요약 실패 시에는 이 전이를 호출하지 않는다 — 기존 상태(done/failed)를 그대로
   * 두고 에러만 전파해 done 회의록이 failed 로 격하되는 것을 막는다(Application 참고).
   */
  resummarizeDone(): PipelineState {
    this.assertNotPending('summary');
    return new PipelineState(this.sttStatus, 'done', this.failures);
  }

  /** 두 stage 모두 pending이 아니면 finalize 가능. */
  get isFinal(): boolean {
    return this.sttStatus !== 'pending' && this.summaryStatus !== 'pending';
  }

  /** 두 stage 모두 done이면 성공 완료. */
  get isDone(): boolean {
    return this.sttStatus === 'done' && this.summaryStatus === 'done';
  }

  private assertPending(stage: PipelineStage): void {
    const status = stage === 'stt' ? this.sttStatus : this.summaryStatus;
    if (status !== 'pending') {
      throw new Error(`Pipeline stage "${stage}" is already ${status}`);
    }
  }

  private assertNotPending(stage: PipelineStage): void {
    const status = stage === 'stt' ? this.sttStatus : this.summaryStatus;
    if (status === 'pending') {
      throw new Error(`Pipeline stage "${stage}" is still pending; cannot resummarize`);
    }
  }

  private appendFailure(
    stage: PipelineStage,
    error: string,
    at: Date,
  ): ReadonlyArray<PipelineFailure> {
    const trimmed = error.trim();
    if (trimmed.length === 0 || trimmed.length > ERROR_MAX) {
      throw new Error(`PipelineFailure.error must be 1~${ERROR_MAX} chars after trim`);
    }
    return [...this.failures, { stage, error: trimmed, at }];
  }
}
