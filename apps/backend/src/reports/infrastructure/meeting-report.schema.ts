import { Schema } from 'mongoose';

/**
 * MeetingReport의 mongoose Schema.
 *
 * Schema는 단순 storage 계약만 표현하며, nested 구조는 `Schema.Types.Mixed`로 둬서 domain 검증과 schema 검증이 중복되지 않게 한다.
 *
 * `_id`는 ObjectId가 아니라 `MeetingReport.id`를 그대로 저장한다(UUID string).
 * `meetingId`는 회의 1건당 회의록 1건 보장을 위해 unique index를 둔다.
 * `endedAt`은 기본 정렬(latest)의 키이므로 descending 인덱스를 함께 둔다.
 */

export const MEETING_REPORT_COLLECTION = 'meeting_reports';

export const meetingReportSchema = new Schema(
  {
    _id: { type: String, required: true },
    meetingId: { type: String, required: true, unique: true, index: true },
    code: { type: String, required: true, index: true },
    source: { type: String, required: true },
    meetingType: { type: String, required: true },
    title: { type: String, default: null },
    externalReference: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true, index: -1 },
    participants: { type: [Schema.Types.Mixed], default: [] },
    chat: { type: [Schema.Types.Mixed], default: [] },
    transcript: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed, default: null },
    pipeline: { type: Schema.Types.Mixed, required: true },
    pushedToNotion: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: MEETING_REPORT_COLLECTION,
    minimize: false,
    versionKey: false,
    // _id를 우리가 직접 set 하므로 자동 ObjectId 생성을 비활성화하지 않는다 —
    // 위 `_id: String` 정의가 우선한다.
  },
);
