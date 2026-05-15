import { IsString, Length, MaxLength } from 'class-validator';

import type { ResumeConsumerRequest } from '@migration/shared-interfaces';

import { MeetingCode } from '@/meeting/domain/value-objects';

const ID_MAX = 64;

export class ResumeConsumerDto implements ResumeConsumerRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  consumerId!: string;
}
