import { ChatEntry, ExternalReference, Source } from '@/shared-kernel/domain/value-objects';

import { ParticipantEntry, TranscriptSegment } from './entries';
import { NotionPushResult, PipelineState, ReportSummary } from './value-objects';

export interface CreateMeetingReportInput {
  id: string;
  meetingId: string;
  code: string;
  source: Source;
  externalReference: ExternalReference;
  startedAt: Date;
  endedAt: Date;
  participants: ReadonlyArray<ParticipantEntry>;
  chat: ReadonlyArray<ChatEntry>;
  title?: string | null;
}

/**
 * 회의록.
 *
 * Meeting이 종료되는 순간 draft가 만들어지고, 비동기 파이프라인(STT → LLM 요약)을 거치면서 transcript·summary·pipeline 상태가 채워진다.
 *
 * 책임:
 *   - 회의 종료 시점의 영속 가능한 draft 생성 + 입력 검증
 *   - 후처리 stage 결과 반영(`applyTranscript`/`applySummary` + `mark*Failed`)
 *   - 노션 push 결과 1회 부착(`attachNotionPushResult`, v2)
 *
 * 도메인 이벤트는 직접 발행하지 않는다(Application Service가 메서드 결과를 보고 발행).
 */
export interface MeetingReportSnapshot {
  readonly id: string;
  readonly meetingId: string;
  readonly code: string;
  readonly source: Source;
  readonly externalReference: ExternalReference;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly title: string | null;
  readonly participants: ReadonlyArray<ParticipantEntry>;
  readonly chat: ReadonlyArray<ChatEntry>;
  readonly transcript: ReadonlyArray<TranscriptSegment>;
  readonly summary: ReportSummary | null;
  readonly pipeline: PipelineState;
  readonly pushedToNotion: NotionPushResult | null;
}

export class MeetingReport {
  private _transcript: ReadonlyArray<TranscriptSegment>;
  private _summary: ReportSummary | null;
  private _pipeline: PipelineState;
  private _pushedToNotion: NotionPushResult | null;

  private constructor(
    public readonly id: string,
    public readonly meetingId: string,
    public readonly code: string,
    public readonly source: Source,
    public readonly externalReference: ExternalReference,
    public readonly startedAt: Date,
    public readonly endedAt: Date,
    public readonly title: string | null,
    public readonly participants: ReadonlyArray<ParticipantEntry>,
    public readonly chat: ReadonlyArray<ChatEntry>,
  ) {
    this._transcript = [];
    this._summary = null;
    this._pipeline = PipelineState.initial();
    this._pushedToNotion = null;
  }

  /**
   * snapshot으로부터 MeetingReport Aggregate를 복원한다.
   *
   * Repository가 영속 저장소에서 읽어들인 raw 도큐먼트를 domain 객체로 되살린다.
   * 입력 데이터는 신뢰 가능한 snapshot이라는 trust 하에 형식 검증은 하지 않는다(검증은 snapshot 생성 시점).
   */
  static fromSnapshot(snapshot: MeetingReportSnapshot): MeetingReport {
    const report = new MeetingReport(
      snapshot.id,
      snapshot.meetingId,
      snapshot.code,
      snapshot.source,
      snapshot.externalReference,
      snapshot.startedAt,
      snapshot.endedAt,
      snapshot.title,
      [...snapshot.participants],
      [...snapshot.chat],
    );
    report._transcript = [...snapshot.transcript];
    report._summary = snapshot.summary;
    report._pipeline = snapshot.pipeline;
    report._pushedToNotion = snapshot.pushedToNotion;
    return report;
  }

  /**
   * Meeting이 종료된 직후 draft 도큐먼트를 만든다.
   */
  static fromEndedMeeting(input: CreateMeetingReportInput): MeetingReport {
    const id = input.id.trim();
    if (id.length === 0) throw new Error('MeetingReport.id must be non-empty');
    const meetingId = input.meetingId.trim();
    if (meetingId.length === 0) throw new Error('MeetingReport.meetingId must be non-empty');
    const code = input.code.trim();
    if (code.length === 0) throw new Error('MeetingReport.code must be non-empty');
    if (input.endedAt.getTime() < input.startedAt.getTime()) {
      throw new Error('MeetingReport.endedAt cannot be earlier than startedAt');
    }
    return new MeetingReport(
      id,
      meetingId,
      code,
      input.source,
      input.externalReference,
      input.startedAt,
      input.endedAt,
      input.title ?? null,
      [...input.participants],
      [...input.chat],
    );
  }

  // ---------- pipeline 전이 ----------

  applyTranscript(segments: ReadonlyArray<TranscriptSegment>): void {
    // pipeline 전이를 먼저 시도해 throw 시 transcript 상태를 보존한다.
    const next = this._pipeline.markTranscriptionDone();
    this._transcript = [...segments];
    this._pipeline = next;
  }

  markTranscriptionFailed(error: string, at: Date): void {
    this._pipeline = this._pipeline.markTranscriptionFailed(error, at);
  }

  applySummary(summary: ReportSummary): void {
    const next = this._pipeline.markSummaryDone();
    this._summary = summary;
    this._pipeline = next;
  }

  markSummaryFailed(error: string, at: Date): void {
    this._pipeline = this._pipeline.markSummaryFailed(error, at);
  }

  /**
   * 관리자 재요약 성공 결과를 반영한다.
   * 기존 summary를 새 summary로 교체하고 summary stage를 done으로 전이한다.
   * 재요약 실패 시에는 호출하지 않는다.
   */
  replaceSummary(summary: ReportSummary): void {
    const next = this._pipeline.resummarizeDone();
    this._summary = summary;
    this._pipeline = next;
  }

  attachNotionPushResult(result: NotionPushResult): void {
    if (!this._pipeline.isFinal) {
      throw new Error('Cannot attach Notion push result before pipeline is final');
    }
    if (this._pushedToNotion !== null) {
      throw new Error('Notion push result has already been attached');
    }
    this._pushedToNotion = result;
  }

  // ---------- queries ----------

  get transcript(): ReadonlyArray<TranscriptSegment> {
    return this._transcript;
  }

  get summary(): ReportSummary | null {
    return this._summary;
  }

  get pipeline(): PipelineState {
    return this._pipeline;
  }

  get pushedToNotion(): NotionPushResult | null {
    return this._pushedToNotion;
  }

  /** 두 stage 모두 non-pending이면 finalize된 상태. 노션 push 시도 자격. */
  get isFinalized(): boolean {
    return this._pipeline.isFinal;
  }

  snapshot(): MeetingReportSnapshot {
    return {
      id: this.id,
      meetingId: this.meetingId,
      code: this.code,
      source: this.source,
      externalReference: this.externalReference,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      title: this.title,
      participants: this.participants,
      chat: this.chat,
      transcript: this._transcript,
      summary: this._summary,
      pipeline: this._pipeline,
      pushedToNotion: this._pushedToNotion,
    };
  }
}
