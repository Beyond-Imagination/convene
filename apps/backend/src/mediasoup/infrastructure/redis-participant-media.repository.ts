import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { ParticipantMedia, ParticipantMediaSnapshot } from '@/mediasoup/domain/participant-media';
import { ParticipantMediaRepository } from '@/mediasoup/domain/ports/participant-media.repository';

const PARTICIPANT_KEY_PREFIX = 'participant-media:';
const MEETING_INDEX_KEY_PREFIX = 'participant-media:meeting:';

/**
 * ParticipantMediaRepository의 redis(ioredis) 구현체.
 *
 * 키 구조:
 *   - `participant-media:{participantId}` (STRING) — Aggregate snapshot JSON.
 *   - `participant-media:meeting:{meetingCode}` (SET) — 같은 회의의 participantId 색인.
 *
 * 그룹 조회(`findByMeetingCode`)는 SET의 SMEMBERS로 pid 목록을 얻고 MGET으로 일괄 조회한다.
 * 도메인 객체의 `meetingCode`는 immutable이라는 가정 하에 동일 participantId가 회의를 옮겨다니지 않는다.
 * 그렇기에 회의 색인 갱신은 단순한 SADD/SREM로 충분하다.
 */
@Injectable()
export class RedisParticipantMediaRepository implements ParticipantMediaRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async save(media: ParticipantMedia): Promise<void> {
    const snapshot = media.snapshot();
    const payload = JSON.stringify(snapshot);
    await this.redis
      .pipeline()
      .set(this.participantKey(snapshot.participantId), payload)
      .sadd(this.meetingIndexKey(snapshot.meetingCode), snapshot.participantId)
      .exec();
  }

  async findByParticipantId(participantId: string): Promise<ParticipantMedia | null> {
    const raw = await this.redis.get(this.participantKey(participantId));
    if (raw === null) return null;
    return ParticipantMedia.fromSnapshot(JSON.parse(raw) as ParticipantMediaSnapshot);
  }

  async findByMeetingCode(meetingCode: string): Promise<ParticipantMedia[]> {
    const pids = await this.redis.smembers(this.meetingIndexKey(meetingCode));
    if (pids.length === 0) return [];
    const keys = pids.map((pid) => this.participantKey(pid));
    const raws = await this.redis.mget(...keys);
    return raws
      .filter((raw): raw is string => raw !== null)
      .map((raw) => ParticipantMedia.fromSnapshot(JSON.parse(raw) as ParticipantMediaSnapshot));
  }

  async removeByParticipantId(participantId: string): Promise<void> {
    const raw = await this.redis.get(this.participantKey(participantId));
    if (raw === null) return;
    const snapshot = JSON.parse(raw) as ParticipantMediaSnapshot;
    await this.redis
      .pipeline()
      .del(this.participantKey(participantId))
      .srem(this.meetingIndexKey(snapshot.meetingCode), participantId)
      .exec();
  }

  async removeAllByMeetingCode(meetingCode: string): Promise<void> {
    const pids = await this.redis.smembers(this.meetingIndexKey(meetingCode));
    if (pids.length === 0) {
      // 색인 SET만 있고 비어 있을 가능성은 없지만 안전하게 DEL 호출.
      await this.redis.del(this.meetingIndexKey(meetingCode));
      return;
    }
    const pipeline = this.redis.pipeline();
    for (const pid of pids) {
      pipeline.del(this.participantKey(pid));
    }
    pipeline.del(this.meetingIndexKey(meetingCode));
    await pipeline.exec();
  }

  private participantKey(participantId: string): string {
    return `${PARTICIPANT_KEY_PREFIX}${participantId}`;
  }

  private meetingIndexKey(meetingCode: string): string {
    return `${MEETING_INDEX_KEY_PREFIX}${meetingCode}`;
  }
}
