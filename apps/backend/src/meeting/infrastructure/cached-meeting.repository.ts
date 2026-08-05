import { Inject, Injectable } from '@nestjs/common';

import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';

import { MongoMeetingRepository } from './mongo-meeting.repository';
import { RedisMeetingRepository } from './redis-meeting.repository';

/** `lastActiveAt`을 뺀 나머지 상태. 두 스냅숏의 이 값이 같으면 실질 변화는 heartbeat뿐이다. */
const fingerprint = (meeting: Meeting): string =>
  JSON.stringify({ ...meeting.snapshot(), lastActiveAt: null });

/**
 * 회의 저장소. 원본은 Mongo, redis는 그 앞의 캐시다.
 *
 * 쓰기는 상태 전이(생성·입장·퇴장·종료)에서만 원본까지 내려간다. 채팅은 메시지마다
 * `markActive` + `save`를 하는데(`meeting.service.postChat`) 이건 heartbeat일 뿐이라
 * 원본 쓰기를 유발하면 안 된다 — 낡은 `lastActiveAt`은 idle 판정을 캐시로 하는 한 무해하고,
 * 캐시가 통째로 날아간 경우엔 재시작 복구가 `markActive(now)`로 다시 잡아 준다.
 */
@Injectable()
export class CachedMeetingRepository implements MeetingRepository {
  constructor(
    private readonly cache: RedisMeetingRepository,
    // 인터페이스 타입은 리플렉션으로 못 찾으므로 원본 구현 클래스를 토큰으로 지정한다.
    @Inject(MongoMeetingRepository) private readonly origin: MeetingRepository,
  ) {}

  async findByCode(code: string): Promise<Meeting | null> {
    const cached = await this.cache.findByCode(code);
    if (cached !== null) return cached;
    const found = await this.origin.findByCode(code);
    if (found !== null) await this.cache.save(found);
    return found;
  }

  async save(meeting: Meeting): Promise<void> {
    const previous = await this.cache.findByCode(meeting.code.value);
    // 캐시에 직전 상태가 없으면 무엇이 바뀌었는지 판단할 수 없다 — 원본에 쓰는 쪽이 안전하다.
    if (previous === null || fingerprint(previous) !== fingerprint(meeting)) {
      await this.origin.save(meeting);
    }
    await this.cache.save(meeting);
  }

  async listOpenCodes(): Promise<string[]> {
    if (await this.cache.isOpenIndexWarm()) {
      return this.cache.listOpenCodes();
    }
    const codes = await this.origin.listOpenCodes();
    await this.cache.primeOpenIndex(codes);
    return codes;
  }
}
