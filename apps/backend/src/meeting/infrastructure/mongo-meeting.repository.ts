import { Inject, Injectable } from '@nestjs/common';
import { Connection, Model } from 'mongoose';

import { Meeting, MeetingSnapshot } from '@/meeting/domain/meeting';
import { ParticipantSnapshot } from '@/meeting/domain/participant';
import { MeetingRepository } from '@/meeting/domain/ports';
import { asMeetingStatus, MeetingStatus } from '@/meeting/domain/value-objects';
import { ExternalReference, MeetingType, Source } from '@/shared-kernel/domain/value-objects';

import { MEETING_COLLECTION, meetingSchema } from './meeting.schema';

const MODEL_NAME = 'Meeting';
const OPEN_STATUS: MeetingStatus = 'open';

interface MeetingDoc {
  _id: string;
  source: Source;
  meetingType: MeetingType;
  externalReference: ExternalReference;
  idleTimeoutMs: number;
  status: MeetingStatus;
  startedAt: Date;
  endedAt: Date | null;
  lastActiveAt: Date;
  participants: ReadonlyArray<ParticipantSnapshot>;
  hostToken: string;
  title: string | null;
}

/**
 * MeetingRepository의 mongoose 구현체 — 회의의 진실 원장.
 *
 * `save`는 `replaceOne(upsert)`으로 멱등 처리한다.
 * 종료된 회의도 그대로 남긴다(노션 카드가 "종료됨"을 표시하려면 조회돼야 한다).
 */
@Injectable()
export class MongoMeetingRepository implements MeetingRepository {
  private readonly model: Model<MeetingDoc>;

  constructor(@Inject(Connection) connection: Connection) {
    // 같은 connection에 두 번 등록되면 mongoose가 OverwriteModelError를 던지므로, 이미 등록되어 있으면 재사용한다.
    this.model =
      (connection.models[MODEL_NAME] as Model<MeetingDoc> | undefined) ??
      connection.model<MeetingDoc>(MODEL_NAME, meetingSchema, MEETING_COLLECTION);
  }

  async findByCode(code: string): Promise<Meeting | null> {
    const doc = await this.model.findById(code).lean<MeetingDoc | null>().exec();
    if (doc === null) return null;
    return Meeting.fromSnapshot(this.toSnapshot(doc));
  }

  async save(meeting: Meeting): Promise<void> {
    const doc = this.toDoc(meeting.snapshot());
    await this.model.replaceOne({ _id: doc._id }, doc, { upsert: true }).exec();
  }

  async listOpenCodes(): Promise<string[]> {
    const docs = await this.model
      .find({ status: OPEN_STATUS }, { _id: 1 })
      .lean<Array<{ _id: string }>>()
      .exec();
    return docs.map((d) => d._id);
  }

  private toDoc(snapshot: MeetingSnapshot): MeetingDoc {
    return {
      _id: snapshot.code,
      source: snapshot.source,
      meetingType: snapshot.meetingType,
      externalReference: snapshot.externalReference,
      idleTimeoutMs: snapshot.idleTimeoutMs,
      status: snapshot.status,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      lastActiveAt: snapshot.lastActiveAt,
      participants: snapshot.participants,
      hostToken: snapshot.hostToken,
      title: snapshot.title,
    };
  }

  private toSnapshot(doc: MeetingDoc): MeetingSnapshot {
    return {
      code: doc._id,
      source: doc.source,
      meetingType: doc.meetingType,
      externalReference: doc.externalReference,
      idleTimeoutMs: doc.idleTimeoutMs,
      status: asMeetingStatus(doc.status),
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      lastActiveAt: doc.lastActiveAt,
      participants: doc.participants.map(
        (p): ParticipantSnapshot => ({
          id: p.id,
          nickname: p.nickname,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
        }),
      ),
      hostToken: doc.hostToken,
      title: doc.title,
    };
  }
}
