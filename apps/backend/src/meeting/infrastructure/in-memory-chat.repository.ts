import { ChatRepository } from '@/meeting/domain/ports';
import { ChatEntry } from '@/shared-kernel/domain/value-objects';

/**
 * ChatRepository의 in-memory 구현체 (stub).
 *
 * 실제 구현은 InMemoryChatRepository spec green 사이클에서 채운다.
 */
export class InMemoryChatRepository implements ChatRepository {
  async append(_code: string, _entry: ChatEntry): Promise<void> {
    throw new Error('not implemented');
  }

  async listByCode(_code: string): Promise<ChatEntry[]> {
    throw new Error('not implemented');
  }
}
