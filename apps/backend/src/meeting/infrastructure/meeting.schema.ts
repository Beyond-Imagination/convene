import { Schema } from 'mongoose';

/**
 * Meeting의 mongoose Schema.
 *
 * `_id`는 ObjectId가 아니라 `MeetingCode`를 그대로 저장한다 — 회의 조회는 전부 code 기준이다.
 * nested 구조는 `Schema.Types.Mixed`로 둬서 domain 검증과 schema 검증이 중복되지 않게 한다.
 * `status`는 `listOpenCodes`의 질의 키라 인덱스를 둔다.
 */

export const MEETING_COLLECTION = 'meetings';

export const meetingSchema = new Schema(
  {
    _id: { type: String, required: true },
    source: { type: String, required: true },
    meetingType: { type: String, required: true },
    externalReference: { type: Schema.Types.Mixed, default: {} },
    idleTimeoutMs: { type: Number, required: true },
    status: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, required: true },
    participants: { type: [Schema.Types.Mixed], default: [] },
    hostToken: { type: String, default: '' },
    title: { type: String, default: null },
  },
  {
    collection: MEETING_COLLECTION,
    minimize: false,
    versionKey: false,
  },
);
