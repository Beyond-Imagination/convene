import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { ChatRepository } from '@/meeting/domain/ports';
import { ChatEntry } from '@/shared-kernel/domain/value-objects';

const KEY_PREFIX = 'chat:';

interface ChatEntryWire {
  readonly nickname: string;
  readonly text: string;
  readonly sentAt: string;
}

/**
 * ChatRepository의 redis(ioredis) 구현체.
 *
 * - 회의별로 redis LIST 한 개(`chat:{code}`)를 쓴다. RPUSH로 끝에 append, LRANGE 0 -1로 시간순 전체 조회.
 * - 회의 종료 시 한 번에 읽어 Report로 이관.
 * - 각 entry는 JSON string. Date(sentAt)는 ISO로 직렬화하고 복원 시 `new Date(iso)`로 객체화한다.
 */
@Injectable()
export class RedisChatRepository implements ChatRepository {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  async append(code: string, entry: ChatEntry): Promise<void> {
    const payload = JSON.stringify(this.toWire(entry));
    await this.redis.rpush(this.key(code), payload);
  }

  async listByCode(code: string): Promise<ChatEntry[]> {
    const raws = await this.redis.lrange(this.key(code), 0, -1);
    return raws.map((raw) => this.fromWire(JSON.parse(raw) as ChatEntryWire));
  }

  private key(code: string): string {
    return `${KEY_PREFIX}${code}`;
  }

  private toWire(entry: ChatEntry): ChatEntryWire {
    return {
      nickname: entry.nickname,
      text: entry.text,
      sentAt: entry.sentAt.toISOString(),
    };
  }

  private fromWire(wire: ChatEntryWire): ChatEntry {
    return {
      nickname: wire.nickname,
      text: wire.text,
      sentAt: new Date(wire.sentAt),
    };
  }
}
