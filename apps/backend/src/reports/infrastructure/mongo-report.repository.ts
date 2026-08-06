import { Inject, Injectable } from '@nestjs/common';
import { Connection, Model } from 'mongoose';

import { MeetingReport, MeetingReportSnapshot } from '@/reports/domain/meeting-report';
import { ReportRepository } from '@/reports/domain/ports/report.repository';
import { PipelineState } from '@/reports/domain/value-objects/pipeline-state';

import { MEETING_REPORT_COLLECTION, meetingReportSchema } from './meeting-report.schema';

const MODEL_NAME = 'MeetingReport';

/**
 * mongoose `lean()` 결과 도큐먼트 모양.
 * Schema.Types.Mixed로 둔 nested들은 도메인 snapshot의 plain interface와 동형이라 그대로 받아 fromWire에서 옮긴다.
 */
interface MeetingReportDoc {
  _id: string;
  meetingId: string;
  code: string;
  source: MeetingReportSnapshot['source'];
  meetingType: MeetingReportSnapshot['meetingType'];
  title: MeetingReportSnapshot['title'];
  externalReference: MeetingReportSnapshot['externalReference'];
  startedAt: Date;
  endedAt: Date;
  participants: MeetingReportSnapshot['participants'];
  chat: MeetingReportSnapshot['chat'];
  transcript: MeetingReportSnapshot['transcript'];
  summary: MeetingReportSnapshot['summary'];
  pipeline: {
    sttStatus: 'pending' | 'done' | 'failed';
    summaryStatus: 'pending' | 'done' | 'failed';
    failures: ReadonlyArray<{ stage: 'stt' | 'summary'; error: string; at: Date }>;
  };
  pushedToNotion: MeetingReportSnapshot['pushedToNotion'];
}

/**
 * ReportRepository의 mongoose 구현체.
 *
 * - `_id` = `MeetingReport.id` (UUID string), `meetingId`는 unique index.
 * - `save`는 `replaceOne(upsert)`으로 멱등 처리.
 * - `listRecent`는 `endedAt -1` 인덱스를 활용.
 */
@Injectable()
export class MongoReportRepository implements ReportRepository {
  private readonly model: Model<MeetingReportDoc>;

  constructor(@Inject(Connection) private readonly connection: Connection) {
    // 같은 connection에 두 번 등록되면 mongoose가 OverwriteModelError를 던지므로, 이미 등록되어 있으면 재사용한다.
    // (NestJS의 hot reload / 다중 모듈 빌드 대비)
    this.model =
      (connection.models[MODEL_NAME] as Model<MeetingReportDoc> | undefined) ??
      connection.model<MeetingReportDoc>(
        MODEL_NAME,
        meetingReportSchema,
        MEETING_REPORT_COLLECTION,
      );
  }

  async save(report: MeetingReport): Promise<void> {
    const wire = this.toWire(report.snapshot());
    await this.model.replaceOne({ _id: report.id }, wire, { upsert: true });
  }

  async findById(id: string): Promise<MeetingReport | null> {
    const doc = await this.model.findById(id).lean<MeetingReportDoc | null>();
    if (!doc) return null;
    return MeetingReport.fromSnapshot(this.fromWire(doc));
  }

  async findByMeetingId(meetingId: string): Promise<MeetingReport | null> {
    const doc = await this.model.findOne({ meetingId }).lean<MeetingReportDoc | null>();
    if (!doc) return null;
    return MeetingReport.fromSnapshot(this.fromWire(doc));
  }

  async listRecent(limit: number): Promise<MeetingReport[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`listRecent.limit must be a non-negative integer, got ${limit}`);
    }
    if (limit === 0) return [];
    const docs = await this.model
      .find()
      .sort({ endedAt: -1 })
      .limit(limit)
      .lean<MeetingReportDoc[]>();
    return docs.map((d) => MeetingReport.fromSnapshot(this.fromWire(d)));
  }

  private toWire(snapshot: MeetingReportSnapshot): MeetingReportDoc {
    return {
      _id: snapshot.id,
      meetingId: snapshot.meetingId,
      code: snapshot.code,
      source: snapshot.source,
      meetingType: snapshot.meetingType,
      title: snapshot.title,
      externalReference: snapshot.externalReference,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      participants: snapshot.participants,
      chat: snapshot.chat,
      transcript: snapshot.transcript,
      summary: snapshot.summary,
      pipeline: {
        sttStatus: snapshot.pipeline.sttStatus,
        summaryStatus: snapshot.pipeline.summaryStatus,
        failures: snapshot.pipeline.failures,
      },
      pushedToNotion: snapshot.pushedToNotion,
    };
  }

  private fromWire(doc: MeetingReportDoc): MeetingReportSnapshot {
    return {
      id: doc._id,
      meetingId: doc.meetingId,
      code: doc.code,
      source: doc.source,
      meetingType: doc.meetingType,
      title: doc.title ?? null,
      externalReference: doc.externalReference,
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      participants: doc.participants,
      chat: doc.chat,
      transcript: doc.transcript,
      summary: doc.summary,
      pipeline: PipelineState.fromSnapshot({
        sttStatus: doc.pipeline.sttStatus,
        summaryStatus: doc.pipeline.summaryStatus,
        failures: doc.pipeline.failures,
      }),
      pushedToNotion: doc.pushedToNotion,
    };
  }
}
