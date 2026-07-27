import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { Meeting, MeetingSnapshot } from '@/meeting/domain/meeting';
import { ParticipantSnapshot } from '@/meeting/domain/participant';
import { MeetingRepository } from '@/meeting/domain/ports';
import { ExternalReference, MeetingType, Source } from '@/shared-kernel/domain/value-objects';

const KEY_PREFIX = 'meeting:';

/**
 * Redis에 저장하는 직렬화 형태. Date는 ISO string으로, 나머지는 snapshot과 동일.
 *
 * 인터페이스를 분리해 두면 스키마가 바뀔 때(필드 추가/이름 변경) 직렬화
 * layer 한 곳에서만 변환을 처리할 수 있다.
 */
interface ParticipantWire {
  readonly id: string;
  readonly nickname: string;
  readonly joinedAt: string;
  readonly leftAt: string | null;
}

interface MeetingWire {
  readonly code: string;
  readonly source: Source;
  readonly meetingType: MeetingType;
  readonly externalReference: ExternalReference;
  readonly idleTimeoutMs: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly lastActiveAt: string;
  readonly participants: ReadonlyArray<ParticipantWire>;
  // 과거 도큐먼트는 이 필드가 없을 수 있어 optional로 읽는다.
  readonly hostToken?: string;
  readonly title?: string | null;
}

/**
 * MeetingRepository의 redis(ioredis) 구현체.
 *
 * 직렬화 정책:
 *   - `meeting:{code}` key에 Aggregate snapshot의 JSON 직렬화 본을 string으로 저장.
 *   - Date는 ISO string, 복원 시 명시적으로 `new Date(iso)`.
 *   - 같은 redis 인스턴스를 BC 들이 공유하므로 `keyPrefix` 옵션이 추가로 `convene:` 등 환경별 네임스페이스를 덧붙인다.
 */
@Injectable()
export class RedisMeetingRepository implements MeetingRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async findByCode(code: string): Promise<Meeting | null> {
    const raw = await this.redis.get(this.key(code));
    if (raw === null) return null;
    const wire = JSON.parse(raw) as MeetingWire;
    return Meeting.fromSnapshot(this.fromWire(wire));
  }

  async save(meeting: Meeting): Promise<void> {
    const payload = JSON.stringify(this.toWire(meeting.snapshot()));
    await this.redis.set(this.key(meeting.code.value), payload);
  }

  async listOpenCodes(): Promise<string[]> {
    throw new Error('not implemented');
  }

  private key(code: string): string {
    return `${KEY_PREFIX}${code}`;
  }

  private toWire(snapshot: MeetingSnapshot): MeetingWire {
    return {
      code: snapshot.code,
      source: snapshot.source,
      meetingType: snapshot.meetingType,
      externalReference: snapshot.externalReference,
      idleTimeoutMs: snapshot.idleTimeoutMs,
      startedAt: snapshot.startedAt.toISOString(),
      endedAt: snapshot.endedAt ? snapshot.endedAt.toISOString() : null,
      lastActiveAt: snapshot.lastActiveAt.toISOString(),
      participants: snapshot.participants.map(
        (p): ParticipantWire => ({
          id: p.id,
          nickname: p.nickname,
          joinedAt: p.joinedAt.toISOString(),
          leftAt: p.leftAt ? p.leftAt.toISOString() : null,
        }),
      ),
      hostToken: snapshot.hostToken,
      title: snapshot.title,
    };
  }

  private fromWire(wire: MeetingWire): MeetingSnapshot {
    return {
      code: wire.code,
      source: wire.source,
      meetingType: wire.meetingType,
      externalReference: wire.externalReference,
      idleTimeoutMs: wire.idleTimeoutMs,
      startedAt: new Date(wire.startedAt),
      endedAt: wire.endedAt ? new Date(wire.endedAt) : null,
      lastActiveAt: new Date(wire.lastActiveAt),
      participants: wire.participants.map(
        (p): ParticipantSnapshot => ({
          id: p.id,
          nickname: p.nickname,
          joinedAt: new Date(p.joinedAt),
          leftAt: p.leftAt ? new Date(p.leftAt) : null,
        }),
      ),
      // 레거시 도큐먼트는 빈 문자열로 복원 — isHost가 빈 토큰을 항상 거부하므로 누구도 종료 권한을 갖지 못하고 idle로만 종료된다.
      hostToken: wire.hostToken ?? '',
      // 레거시 도큐먼트는 null로 복원.
      title: wire.title ?? null,
    };
  }
}
