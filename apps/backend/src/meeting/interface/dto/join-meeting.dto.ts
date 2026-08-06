import type { JoinMeetingMessage } from '@convene/shared-interfaces';
import { IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

const NICKNAME_MAX = 40;

export class JoinMeetingDto implements JoinMeetingMessage {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @Length(1, NICKNAME_MAX)
  nickname!: string;
}
