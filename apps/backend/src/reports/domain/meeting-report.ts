import { ExternalReference, Source } from '../../shared-kernel/domain/value-objects';
import { ChatEntry, ParticipantEntry, TranscriptSegment } from './entries';
import {
  NotionPushResult,
  PipelineState,
  ReportSummary,
} from './value-objects';

/**
 * 회의록. Bounded Context 'Report'의 Aggregate Root.
 *
 * Meeting이 종료되는 순간 `fromEndedMeeting(...)`으로 draft가 만들어지고,
 * 비동기 파이프라인(STT → LLM 요약)을 거치면서 transcript·summary·pipeline
 * 상태가 채워진다(ARCHITECTURE.md §5 상태도, §6 시퀀스).
 *
 * 책임:
 *   - 회의 종료 시점의 영속 가능한 draft 생성 + 입력 검증
 *   - 후처리 stage 결과 반영(`applyTranscript`/`applySummary` + `mark*Failed`)
 *   - 노션 push 결과 1회 부착(`attachNotionPushResult`, v2)
 *
 * 도메인 이벤트는 직접 발행하지 않으며, Application Service가 메서드 호출
 * 결과를 보고 `@nestjs/event-emitter`로 발행한다.
 */

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
}

export interface MeetingReportSnapshot {
  readonly id: string;
  readonly meetingId: string;
  readonly code: string;
  readonly source: Source;
  readonly externalReference: ExternalReference;
  readonly startedAt: Date;
  readonly endedAt: Date;
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
    public readonly participants: ReadonlyArray<ParticipantEntry>,
    public readonly chat: ReadonlyArray<ChatEntry>,
  ) {
    this._transcript = [];
    this._summary = null;
    this._pipeline = PipelineState.initial();
    this._pushedToNotion = null;
  }

  /**
   * Meeting이 종료된 직후 draft 도큐먼트를 만든다.
   * transcript·summary는 빈 상태이며 pipeline은 두 stage 모두 pending.
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
      participants: this.participants,
      chat: this.chat,
      transcript: this._transcript,
      summary: this._summary,
      pipeline: this._pipeline,
      pushedToNotion: this._pushedToNotion,
    };
  }
}
