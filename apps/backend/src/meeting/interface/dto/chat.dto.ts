import type { ChatMessage } from '@convene/shared-interfaces';
import { IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

const TEXT_MIN = 1;
const TEXT_MAX = 1000;

/**
 * `meeting:chat` WS payload DTO. shared-interfaces.ChatMessage를 implements한다.
 */
export class ChatDto implements ChatMessage {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @Length(TEXT_MIN, TEXT_MAX)
  text!: string;
}
