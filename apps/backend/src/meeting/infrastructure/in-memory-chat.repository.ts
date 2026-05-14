import { ChatRepository } from '@/meeting/domain/ports';
import { ChatEntry } from '@/shared-kernel/domain/value-objects';

/**
 * ChatRepository의 in-memory 구현체.
 *
 * e2e 테스트와 v1 초기 부트스트랩용. Redis 구현체로 교체되기 전까지의 default provider.
 */
export class InMemoryChatRepository implements ChatRepository {
  private readonly store = new Map<string, ChatEntry[]>();

  async append(code: string, entry: ChatEntry): Promise<void> {
    const list = this.store.get(code);
    if (list) {
      list.push(entry);
    } else {
      this.store.set(code, [entry]);
    }
  }

  async listByCode(code: string): Promise<ChatEntry[]> {
    const list = this.store.get(code);
    return list ? [...list] : [];
  }
}
