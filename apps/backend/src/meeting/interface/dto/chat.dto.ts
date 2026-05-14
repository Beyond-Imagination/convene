import type { ChatMessage } from '@migration/shared-interfaces';

/**
 * `meeting:chat` WS payload DTO (stub).
 *
 * 구현은 ChatDto spec green 사이클에서 채운다.
 */
export class ChatDto implements ChatMessage {
  code!: string;
  text!: string;
}
