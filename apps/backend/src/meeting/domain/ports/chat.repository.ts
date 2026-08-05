import { ChatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

/**
 * 회의 중 흐르는 채팅 보관소.
 *
 * Meeting Aggregate가 채팅을 직접 들고 있지 않는 이유:
 *   - 채팅 한 건마다 Aggregate 전체 save를 일으키지 않기 위해.
 *   - 회의 종료 시 한 번에 읽어 Report로 이관하기 위해.
 */
export interface ChatRepository {
  /** 회의(`code`)에 채팅 한 건을 추가한다. */
  append(code: string, entry: ChatEntry): Promise<void>;

  /** 회의 종료 시 영속 도큐먼트로 옮기기 위해 전체 목록을 시간순으로 읽는다. */
  listByCode(code: string): Promise<ChatEntry[]>;
}
