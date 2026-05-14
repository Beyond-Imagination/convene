import { IsString, Length } from 'class-validator';

import type { LeaveMeetingMessage } from '@migration/shared-interfaces';

import { MeetingCode } from '@/meeting/domain/value-objects';

/**
 * `meeting:leave` WS payload DTO. shared-interfaces.LeaveMeetingMessage를 implements한다.
 */
export class LeaveMeetingDto implements LeaveMeetingMessage {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}
